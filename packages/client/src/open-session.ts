import type { SupervisorFile } from "@runyard/protocol";
import type { ResolvedOptions } from "./connect-options.ts";
import { Connection } from "./connection.ts";
import { readDiscoveryFile } from "./discovery.ts";
import { ClientHandshake } from "./handshake-client.ts";

// 一次“读发现文件、连接、握手”的尝试。结果只有三种，由调用方决定接下来怎么办：
//  absent    没有发现文件，或有文件但没有人在监听（管理进程不存在，去启动一个）
//  rejected  有人在监听，但握手没过（冒充者、占住连接点的别的进程、或者刚换新还没写好新的发现文件）
//  ready     握手通过，口令从没出现在连接上

export interface PeerVersion {
  protocol: number;
  minProtocol: number;
  build: string;
}

export type SessionAttempt =
  | { kind: "absent" }
  | { kind: "rejected"; file: SupervisorFile }
  | { kind: "ready"; connection: Connection; file: SupervisorFile; peer: PeerVersion };

export async function attemptSession(ctx: ResolvedOptions): Promise<SessionAttempt> {
  const { platform, clock, timeouts } = ctx;
  // 没有口令就不连、不发任何握手消息
  const file = await readDiscoveryFile(platform);
  if (file === undefined) return { kind: "absent" };

  let socket: Awaited<ReturnType<typeof platform.ipc.connect>>;
  try {
    socket = await platform.ipc.connect(timeouts.connectMs);
  } catch {
    return { kind: "absent" };
  }
  const connection = new Connection(socket, clock);
  const reject = (): SessionAttempt => {
    connection.close();
    return { kind: "rejected", file };
  };

  const handshake = new ClientHandshake({
    // 密钥是十六进制口令解出的 32 个原始字节，与管理进程一侧一致
    token: Buffer.from(file.token, "hex"),
    ipc: platform.ipc,
    protocol: ctx.protocol,
    minProtocol: ctx.minProtocol,
    client: { kind: ctx.client.kind, build: ctx.client.build, pid: ctx.client.pid },
    newNonce: ctx.newNonce,
  });

  const first = await connection.nextMessage(timeouts.handshakeMs);
  if (first.kind !== "message") return reject();
  const challenge = handshake.receiveChallenge(first.value);
  if (!challenge.ok) return reject();
  connection.send(challenge.hello);

  const second = await connection.nextMessage(timeouts.handshakeMs);
  if (second.kind !== "message") return reject();
  const ready = handshake.receiveReady(second.value);
  if (!ready.ok) return reject();

  connection.startFrames();
  return {
    kind: "ready",
    connection,
    file,
    peer: {
      protocol: challenge.challenge.protocol,
      minProtocol: challenge.challenge.minProtocol,
      build: ready.ready.build,
    },
  };
}
