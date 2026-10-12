import { randomBytes } from "node:crypto";
import { proofMessage } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { ClientHandshake } from "./handshake-client.ts";

// 握手客户端一侧的每条拒绝路径，不经过 socket。证明函数用平台层的同一份实现。

const { ipc } = createFakePlatform().platform;
const tokenHex = "ab".repeat(32);
const token = Buffer.from(tokenHex, "hex");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

function newHandshake(newNonce: () => string = () => hex(32)) {
  return new ClientHandshake({
    token,
    ipc,
    protocol: 1,
    minProtocol: 1,
    client: { kind: "cli", build: "b", pid: 5 },
    newNonce,
  });
}

function challenge(nonce: string) {
  return { t: "challenge", nonce, protocol: 1, minProtocol: 1 };
}

describe("客户端握手", () => {
  it("[PROTOCOL-HANDSHAKE-01] 应答的证明以口令的 32 个原始字节为密钥，对“client 前缀加两个 nonce”做摘要；十六进制字符串当密钥是错的", () => {
    const serverNonce = hex(32);
    const handshake = newHandshake();
    const verdict = handshake.receiveChallenge(challenge(serverNonce));
    if (!verdict.ok) throw new Error("expected ok");
    const message = proofMessage("client", serverNonce, verdict.hello.clientNonce);
    expect(verdict.hello.proof).toBe(ipc.computeProof(token, message));
    expect(verdict.hello.proof).not.toBe(ipc.computeProof(Buffer.from(tokenHex), message));
    expect(JSON.stringify(verdict.hello)).not.toContain(tokenHex);
  });

  it("[PROTOCOL-HANDSHAKE-01] 服务端的证明要用 server 方向的前缀验证，对了才放行", () => {
    const serverNonce = hex(32);
    const handshake = newHandshake();
    const verdict = handshake.receiveChallenge(challenge(serverNonce));
    if (!verdict.ok) throw new Error("expected ok");
    const proof = ipc.computeProof(
      token,
      proofMessage("server", serverNonce, verdict.hello.clientNonce),
    );
    expect(handshake.receiveReady({ t: "ready", proof, build: "x" })).toMatchObject({ ok: true });
  });

  it("[PROTOCOL-HANDSHAKE-02] 不知道口令的 ready 被拒绝", () => {
    const handshake = newHandshake();
    handshake.receiveChallenge(challenge(hex(32)));
    expect(handshake.receiveReady({ t: "ready", proof: hex(32), build: "x" })).toEqual({
      ok: false,
      reason: "bad-proof",
    });
  });

  it("[PROTOCOL-HANDSHAKE-05] 把客户端的应答原样回传当作 ready：方向前缀不同，验不过", () => {
    const handshake = newHandshake();
    const verdict = handshake.receiveChallenge(challenge(hex(32)));
    if (!verdict.ok) throw new Error("expected ok");
    expect(handshake.receiveReady({ t: "ready", proof: verdict.hello.proof, build: "x" })).toEqual({
      ok: false,
      reason: "bad-proof",
    });
  });

  it.each([
    ["空", ""],
    ["31 字节", hex(31)],
    ["33 字节", hex(33)],
    ["大写", hex(32).toUpperCase()],
  ])("[PROTOCOL-HANDSHAKE-04] 质询里的 nonce 是%s：拒绝，不产生 hello", (_name, nonce) => {
    expect(newHandshake().receiveChallenge(challenge(nonce))).toEqual({
      ok: false,
      reason: "invalid-challenge",
    });
  });

  it("没有收到质询就收到 ready，或同一次握手收到第二条 ready：不认", () => {
    expect(newHandshake().receiveReady({ t: "ready", proof: hex(32), build: "x" })).toMatchObject({
      ok: false,
    });
    const handshake = newHandshake();
    const serverNonce = hex(32);
    const verdict = handshake.receiveChallenge(challenge(serverNonce));
    if (!verdict.ok) throw new Error("expected ok");
    const proof = ipc.computeProof(
      token,
      proofMessage("server", serverNonce, verdict.hello.clientNonce),
    );
    expect(handshake.receiveReady({ t: "ready", proof, build: "x" })).toMatchObject({ ok: true });
    expect(handshake.receiveReady({ t: "ready", proof, build: "x" })).toMatchObject({ ok: false });
  });

  it("自己生成的 nonce 长度不对是实现缺陷，直接抛错而不是发出去", () => {
    expect(() => newHandshake(() => hex(8)).receiveChallenge(challenge(hex(32)))).toThrow();
  });
});
