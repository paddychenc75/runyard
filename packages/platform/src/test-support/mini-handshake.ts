import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import {
  challengeSchema,
  type Hello,
  NONCE_BYTES,
  proofMessage,
  readySchema,
} from "@runyard/protocol";
import type { Platform } from "../platform.ts";

// 握手对话的最小替身：只为了在测试里检验“伪装的对端过不了关、口令不会泄露”。
// 真正的握手由管理进程（#39）和客户端（#44）实现，它们应当满足同样的检查；
// 这里只用 platform.ipc 的证明函数和 protocol 的消息形状，不含重试、版本比对、请求。

export type Verdict = "accepted" | "rejected";

async function nextLine(socket: Socket, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let buffer = "";
    const done = (value: string | null) => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("close", onClose);
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const end = buffer.indexOf("\n");
      if (end >= 0) done(buffer.slice(0, end));
    };
    const onClose = () => done(null);
    const timer = setTimeout(() => done(null), timeoutMs);
    socket.on("data", onData);
    socket.once("close", onClose);
  });
}

function parse(line: string | null): unknown {
  if (line === null) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** 客户端一侧：有口令才开始；任何一步不对就断开，不发请求 */
export async function clientHandshake(
  ipc: Platform["ipc"],
  socket: Socket,
  token: Uint8Array,
  timeoutMs: number,
): Promise<Verdict> {
  const challenge = challengeSchema.safeParse(parse(await nextLine(socket, timeoutMs)));
  if (!challenge.success) return reject(socket);
  const clientNonce = randomBytes(NONCE_BYTES).toString("hex");
  const hello: Hello = {
    t: "hello",
    clientNonce,
    proof: ipc.computeProof(token, proofMessage("client", challenge.data.nonce, clientNonce)),
    protocol: challenge.data.protocol,
    minProtocol: challenge.data.minProtocol,
    client: { kind: "cli", build: "test", pid: process.pid },
  };
  socket.write(`${JSON.stringify(hello)}\n`);
  const ready = readySchema.safeParse(parse(await nextLine(socket, timeoutMs)));
  if (!ready.success) return reject(socket);
  const expected = proofMessage("server", challenge.data.nonce, clientNonce);
  if (!ipc.verifyProof(token, expected, ready.data.proof)) return reject(socket);
  return "accepted";
}

function reject(socket: Socket): Verdict {
  socket.destroy();
  return "rejected";
}

/** 真的管理进程一侧：发质询，校验客户端的证明，回应答 */
export async function serverHandshake(
  ipc: Platform["ipc"],
  socket: Socket,
  token: Uint8Array,
  timeoutMs: number,
): Promise<Verdict> {
  const nonce = randomBytes(NONCE_BYTES).toString("hex");
  socket.write(`${JSON.stringify({ t: "challenge", nonce, protocol: 1, minProtocol: 1 })}\n`);
  const hello = parse(await nextLine(socket, timeoutMs)) as Hello | undefined;
  if (hello === undefined || typeof hello.clientNonce !== "string") return reject(socket);
  const message = proofMessage("client", nonce, hello.clientNonce);
  if (!ipc.verifyProof(token, message, hello.proof)) return reject(socket);
  const proof = ipc.computeProof(token, proofMessage("server", nonce, hello.clientNonce));
  socket.write(`${JSON.stringify({ t: "ready", proof, build: "test" })}\n`);
  return "accepted";
}
