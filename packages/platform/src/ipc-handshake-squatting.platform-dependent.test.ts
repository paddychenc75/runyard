import { randomBytes } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlatform } from "./get-platform.ts";
import type { Platform } from "./platform.ts";
import { clientHandshake, serverHandshake } from "./test-support/mini-handshake.ts";
import { makeTempHome } from "./test-support/temp-home.ts";

// 占住连接点的假对端：反射、乱答、不说话的一律过不了关，口令一次也不会发给它们
// （决策记录 0005，证据实验 E：16 种情形 × 4 台机器，口令 0 次出现在对方收到的字节里）。
// 这里的握手客户端和服务端是 test-support/mini-handshake.ts 里的最小替身，只检验平台层的证明函数
// 加 protocol 的消息形状够不够用；完整的握手对话在 #39 和 #44 实现，它们要通过同样的检查。

const TIMEOUT_MS = 300;

let sandbox: ReturnType<typeof makeTempHome>;
let platform: Platform;
let token: Buffer;
const servers: Server[] = [];
const received: Buffer[] = [];
const sockets: Socket[] = [];

beforeEach(async () => {
  sandbox = makeTempHome();
  platform = getPlatform({ home: sandbox.home, profile: undefined });
  token = randomBytes(32);
  received.length = 0;
  // 让 listen 建好 run/ 目录，然后放掉连接点，由各个对端自己占
  const probe = await platform.ipc.listen();
  await new Promise((r) => probe.close(r));
});

afterEach(async () => {
  try {
    for (const socket of sockets.splice(0)) socket.destroy();
    for (const server of servers.splice(0)) await new Promise((r) => server.close(r));
  } finally {
    sandbox.remove();
  }
});

type Behaviour = (socket: Socket) => void;

async function occupy(behaviour: Behaviour): Promise<void> {
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on("data", (chunk) => received.push(chunk));
    behaviour(socket);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen({ path: platform.ipc.endpoint() }, resolve));
}

const send = (socket: Socket, message: unknown) => socket.write(`${JSON.stringify(message)}\n`);
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

// 读到客户端的下一条消息再回话
function onHello(socket: Socket, reply: (hello: { proof: string }) => void) {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const end = buffer.indexOf("\n");
    if (end >= 0) reply(JSON.parse(buffer.slice(0, end)) as { proof: string });
  });
}

const validChallenge = () => ({ t: "challenge", nonce: hex(32), protocol: 1, minProtocol: 1 });

const impostors: Array<[name: string, behaviour: Behaviour]> = [
  ["不说话", () => {}],
  ["回乱码", (s) => s.write("this is not json\n")],
  [
    "空 nonce，再把客户端的证明原样当作服务端证明回传",
    (s) => {
      send(s, { t: "challenge", nonce: "", protocol: 1, minProtocol: 1 });
      onHello(s, (hello) => send(s, { t: "ready", proof: hello.proof, build: "x" }));
    },
  ],
  [
    "nonce 只有 31 字节",
    (s) => {
      send(s, { t: "challenge", nonce: hex(31), protocol: 1, minProtocol: 1 });
      onHello(s, () => send(s, { t: "ready", proof: hex(32), build: "x" }));
    },
  ],
  [
    "像样的质询，应答里的证明是编的",
    (s) => {
      send(s, validChallenge());
      onHello(s, () => send(s, { t: "ready", proof: hex(32), build: "x" }));
    },
  ],
  [
    "像样的质询，把客户端的证明原样当作服务端证明（方向前缀不同，所以对不上）",
    (s) => {
      send(s, validChallenge());
      onHello(s, (hello) => send(s, { t: "ready", proof: hello.proof, build: "x" }));
    },
  ],
];

function tokenAppears(bytes: Buffer): boolean {
  const forms = [
    token.toString("latin1"),
    token.toString("base64"),
    token.toString("base64url"),
    token.toString("hex"),
  ];
  const text = bytes.toString("latin1");
  return forms.some((form) => text.includes(form));
}

describe("连接点被不知道口令的进程占住", () => {
  for (const [name, behaviour] of impostors) {
    it(`[SUPERVISOR-LIFECYCLE-05] 假对端（${name}）被拒绝，口令没有发给它`, async () => {
      await occupy(behaviour);
      const socket = await platform.ipc.connect(1000);
      const verdict = await clientHandshake(platform.ipc, socket, token, TIMEOUT_MS);
      expect(verdict).toBe("rejected");
      expect(socket.destroyed).toBe(true);
      expect(tokenAppears(Buffer.concat(received))).toBe(false);
    });
  }

  it("对照：真的对端（知道口令）通过，且线上的字节也不含口令", async () => {
    const wire: Buffer[] = [];
    await occupy((socket) => {
      socket.on("data", (chunk) => wire.push(chunk));
      void serverHandshake(platform.ipc, socket, token, 1000);
    });
    const socket = await platform.ipc.connect(1000);
    socket.on("data", (chunk) => wire.push(chunk));
    const verdict = await clientHandshake(platform.ipc, socket, token, 1000);
    expect(verdict).toBe("accepted");
    expect(tokenAppears(Buffer.concat(wire))).toBe(false);
    socket.destroy();
  });

  it("对端知道另一个口令（旧的、别人的）也过不了关", async () => {
    await occupy((socket) => {
      void serverHandshake(platform.ipc, socket, randomBytes(32), TIMEOUT_MS);
    });
    const socket = await platform.ipc.connect(1000);
    expect(await clientHandshake(platform.ipc, socket, token, TIMEOUT_MS)).toBe("rejected");
  });
});
