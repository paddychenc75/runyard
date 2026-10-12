import { randomBytes } from "node:crypto";
import { type Hello, proofMessage, readySchema } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { ServerHandshake } from "./handshake-server.ts";

// 握手服务端的状态机：每条拒绝路径都单独测，并断言口令从不出现在服务端发出的消息里。
// 证明函数是假平台沿用的真实现（纯函数，不碰系统，Windows 上也能跑）。

const { ipc } = createFakePlatform().platform;
const token = randomBytes(32);
const NONCE = "ab".repeat(32);

function newHandshake() {
  return new ServerHandshake({
    token,
    ipc,
    protocol: 1,
    minProtocol: 1,
    build: "b1",
    newNonce: () => NONCE,
  });
}

function validHello(clientNonce = "cd".repeat(32)): Hello {
  return {
    t: "hello",
    clientNonce,
    proof: ipc.computeProof(token, proofMessage("client", NONCE, clientNonce)),
    protocol: 1,
    minProtocol: 1,
    client: { kind: "cli", build: "cb", pid: 123 },
  };
}

let handshake: ServerHandshake;
beforeEach(() => {
  handshake = newHandshake();
});

describe("服务端握手", () => {
  it("[PROTOCOL-HANDSHAKE-01] 质询带随机数和版本，正确的应答换来能被客户端验证的服务端证明", () => {
    expect(handshake.challenge).toEqual({
      t: "challenge",
      nonce: NONCE,
      protocol: 1,
      minProtocol: 1,
    });
    const hello = validHello();
    const verdict = handshake.receiveHello(hello);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(readySchema.safeParse(verdict.ready).success).toBe(true);
    expect(verdict.ready.build).toBe("b1");
    const expected = proofMessage("server", NONCE, hello.clientNonce);
    expect(ipc.verifyProof(token, expected, verdict.ready.proof)).toBe(true);
  });

  it("[PROTOCOL-HANDSHAKE-01] 服务端发出的任何消息里都没有口令", () => {
    const verdict = handshake.receiveHello(validHello());
    const wire = JSON.stringify([handshake.challenge, verdict.ok ? verdict.ready : null]);
    for (const form of [
      token.toString("hex"),
      token.toString("base64"),
      token.toString("base64url"),
    ]) {
      expect(wire).not.toContain(form);
    }
  });

  it("[PROTOCOL-HANDSHAKE-02] 不知道口令的应答被拒绝", () => {
    const wrong = randomBytes(32);
    const hello = validHello();
    hello.proof = ipc.computeProof(wrong, proofMessage("client", NONCE, hello.clientNonce));
    expect(handshake.receiveHello(hello)).toEqual({ ok: false, reason: "bad-proof" });
  });

  it("[PROTOCOL-HANDSHAKE-02] 把服务端方向的证明当作客户端证明回传（反射）被拒绝", () => {
    const hello = validHello();
    // 知道口令的人（这里是测试）用错误的方向前缀算出的证明：方向前缀不同，所以对不上
    hello.proof = ipc.computeProof(token, proofMessage("server", NONCE, hello.clientNonce));
    expect(handshake.receiveHello(hello)).toEqual({ ok: false, reason: "bad-proof" });
  });

  it("[PROTOCOL-HANDSHAKE-02] 把质询的 nonce 原样当作 clientNonce 也过不了关", () => {
    const hello = validHello(NONCE);
    hello.proof = "00".repeat(32);
    expect(handshake.receiveHello(hello).ok).toBe(false);
  });

  it.each([
    ["空", ""],
    ["31 字节", "ab".repeat(31)],
    ["33 字节", "ab".repeat(33)],
    ["大写十六进制", "AB".repeat(32)],
    ["不是十六进制", "zz".repeat(32)],
  ])("[PROTOCOL-HANDSHAKE-04] clientNonce 长度或格式不对（%s）被拒绝", (_name, clientNonce) => {
    const hello = validHello();
    hello.clientNonce = clientNonce;
    hello.proof = ipc.computeProof(token, proofMessage("client", NONCE, clientNonce));
    expect(handshake.receiveHello(hello)).toEqual({ ok: false, reason: "invalid-hello" });
  });

  it("[PROTOCOL-HANDSHAKE-06] 握手没完成就来的请求帧不是应答，被拒绝", () => {
    expect(handshake.receiveHello({ t: "req", id: 1, method: "ping", params: {} }).ok).toBe(false);
  });

  it("把服务端自己的质询或 ready 反射回来不是应答", () => {
    expect(newHandshake().receiveHello(handshake.challenge).ok).toBe(false);
    expect(newHandshake().receiveHello({ t: "ready", proof: "00".repeat(32), build: "x" }).ok).toBe(
      false,
    );
  });

  it("同一个质询只接受一次应答，重放同一条 hello 不再得到 ready", () => {
    const hello = validHello();
    expect(handshake.receiveHello(hello).ok).toBe(true);
    expect(handshake.receiveHello(hello).ok).toBe(false);
  });

  it("服务端自己的 nonce 不是 32 字节就拒绝构造", () => {
    expect(
      () =>
        new ServerHandshake({
          token,
          ipc,
          protocol: 1,
          minProtocol: 1,
          build: "b",
          newNonce: () => "",
        }),
    ).toThrow();
  });
});
