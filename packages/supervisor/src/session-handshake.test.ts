import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { World } from "./supervisor-harness.test.ts";
import { tokenBytes } from "./test-client.ts";

// 真的 socket（假平台里是 127.0.0.1 上的临时端口）上的服务端握手：每条拒绝路径都断开连接，
// 且任何方向的字节里都没有口令。

let world = new World();
afterEach(() => world.dispose());

function tokenForms(tokenHex: string): string[] {
  const raw = Buffer.from(tokenHex, "hex");
  return [tokenHex, raw.toString("base64"), raw.toString("base64url"), raw.toString("latin1")];
}

function expectNoToken(wire: Buffer, tokenHex: string) {
  const text = wire.toString("latin1");
  for (const form of tokenForms(tokenHex)) expect(text).not.toContain(form);
}

describe("会话握手", () => {
  it("[PROTOCOL-HANDSHAKE-01] 正常握手：先发质询，应答之后才收到 ready，连接上没有口令", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.connect();
    const { ready } = await client.handshake(world.fake.platform, tokenBytes(handle.token));
    expect(ready.build).toBe("0.0.0-test+aaaa");
    const response = await client.request("ping");
    expect(response).toMatchObject({ ok: true, result: {} });
    expectNoToken(client.wire(), handle.token);
  });

  it("[PROTOCOL-HANDSHAKE-02] 口令不对：断开，不回 ready，口令没上线", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.connect();
    const wrong = randomBytes(32);
    const challenge = await client.readChallenge();
    client.write(client.buildHello(world.fake.platform, wrong, challenge));
    expect(await client.next()).toBeUndefined();
    await client.closed;
    expect(client.received.length).toBe(1);
    expectNoToken(client.wire(), handle.token);
  });

  it("[PROTOCOL-HANDSHAKE-02] 反射：用服务端方向算的证明回过来，断开", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.connect();
    const challenge = await client.readChallenge();
    const hello = client.buildHello(world.fake.platform, tokenBytes(handle.token), challenge);
    // 用 server 方向的前缀重新算证明：这正是“把服务端会发的东西当作客户端证明”
    hello.proof = world.fake.platform.ipc.computeProof(
      tokenBytes(handle.token),
      `runyard-handshake-1|server|${challenge.nonce}${hello.clientNonce}`,
    );
    client.write(hello);
    expect(await client.next()).toBeUndefined();
  });

  it.each([
    ["空", ""],
    ["31 字节", "ab".repeat(31)],
    ["33 字节", "ab".repeat(33)],
  ])(
    "[PROTOCOL-HANDSHAKE-04] clientNonce 长度不对（%s）：立即断开，不继续握手",
    async (_n, clientNonce) => {
      world = new World();
      const handle = await world.start();
      const client = await world.connect();
      const challenge = await client.readChallenge();
      client.write(
        client.buildHello(world.fake.platform, tokenBytes(handle.token), challenge, {
          clientNonce,
        }),
      );
      expect(await client.next()).toBeUndefined();
      // 只收到过那条质询，没有第二条
      expect(client.received.length).toBe(1);
    },
  );

  it("[PROTOCOL-HANDSHAKE-06] 握手之前到达的请求帧：断开，请求不被处理", async () => {
    world = new World();
    let called = 0;
    await world.start({
      extend: () => ({
        handlers: {
          "playground.list": () => {
            called++;
            return [];
          },
        },
      }),
    });
    const client = await world.connect();
    await client.readChallenge();
    client.write({ t: "req", id: 1, method: "playground.list", params: {} });
    expect(await client.next()).toBeUndefined();
    expect(called).toBe(0);
  });

  it("[SUPERVISOR-LIFECYCLE-05] 不知道口令的占位者连上来也只拿到质询，口令不在质询里", async () => {
    world = new World();
    const handle = await world.start();
    const squatter = await world.connect();
    const challenge = await squatter.readChallenge();
    expect(JSON.stringify(challenge)).not.toContain(handle.token);
    squatter.write("not a hello");
    squatter.writeRaw("garbage\n");
    expect(await squatter.next()).toBeUndefined();
    expectNoToken(squatter.wire(), handle.token);
  });

  it("握手超时：连上不说话的连接到点被断开，别的会话不受影响", async () => {
    world = new World();
    const handle = await world.start();
    const idle = await world.connect();
    await idle.readChallenge();
    const good = await world.session(handle);
    await world.clock.advance(5000);
    await idle.closed;
    expect(await good.request("ping")).toMatchObject({ ok: true });
  });

  it("[PROTOCOL-HANDSHAKE-19] 超过 8 MB 的一行：只关这一个连接，其他会话照常", async () => {
    world = new World();
    const handle = await world.start();
    const good = await world.session(handle);
    const bad = await world.session(handle);
    bad.writeRaw(Buffer.alloc(8 * 1024 * 1024 + 1024, 0x61));
    await bad.closed;
    expect(await good.request("ping")).toMatchObject({ ok: true });
    expect(handle.connectionCount()).toBe(1);
  });

  it("[PROTOCOL-HANDSHAKE-19] 握手之前发来的超长行同样只关这一个连接", async () => {
    world = new World();
    const handle = await world.start();
    const good = await world.session(handle);
    const bad = await world.connect();
    await bad.readChallenge();
    bad.writeRaw(Buffer.alloc(9 * 1024 * 1024, 0x61));
    await bad.closed;
    expect(await good.request("ping")).toMatchObject({ ok: true });
  });
});
