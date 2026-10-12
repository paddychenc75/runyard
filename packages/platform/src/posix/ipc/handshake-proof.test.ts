import { createHmac } from "node:crypto";
import { HANDSHAKE_PREFIX, proofMessage, proofSchema } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { computeProof, verifyProof } from "./handshake-proof.ts";

const hex = (text: string) => Buffer.from(text, "hex");

describe("computeProof", () => {
  // RFC 4231 的已知向量（HMAC-SHA256）
  it("与 RFC 4231 测试用例 1 一致", () => {
    const key = hex("0b".repeat(20));
    expect(computeProof(key, "Hi There")).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });

  it("与 RFC 4231 测试用例 2 一致（密钥比摘要块短）", () => {
    expect(computeProof(Buffer.from("Jefe"), "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("与 RFC 4231 测试用例 6 一致（密钥比摘要块长）", () => {
    const key = hex("aa".repeat(131));
    expect(computeProof(key, "Test Using Larger Than Block-Size Key - Hash Key First")).toBe(
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    );
  });

  it("输出符合 protocol 的证明格式（64 个小写十六进制字符）", () => {
    const proof = computeProof(Buffer.from("k"), "m");
    expect(proofSchema.safeParse(proof).success).toBe(true);
  });

  it("对握手摘要输入的已知向量：两个方向得出不同的证明", () => {
    const key = hex("11".repeat(32));
    const nonce = "aa".repeat(32);
    const clientNonce = "bb".repeat(32);
    const client = computeProof(key, proofMessage("client", nonce, clientNonce));
    const server = computeProof(key, proofMessage("server", nonce, clientNonce));
    expect(client).toBe(
      createHmac("sha256", key)
        .update(`${HANDSHAKE_PREFIX}client|${nonce}${clientNonce}`)
        .digest("hex"),
    );
    expect(client).not.toBe(server);
    // 固定下来的向量：前缀、方向或拼接方式变了，这里会红
    expect(client).toBe("1ce449ca2feada2d72bb88245f5a80be559b8a1e4acd4f4ae613e39de10cd4ec");
  });
});

describe("verifyProof", () => {
  const key = Buffer.from("secret-token");
  const message = "some message";
  const good = computeProof(key, message);

  it("正确的证明通过", () => {
    expect(verifyProof(key, message, good)).toBe(true);
  });

  it("改动任何一位都不通过", () => {
    const flipped = `${good.slice(0, 63)}${good.endsWith("0") ? "1" : "0"}`;
    expect(verifyProof(key, message, flipped)).toBe(false);
  });

  it("口令、消息不对都不通过", () => {
    expect(verifyProof(Buffer.from("other"), message, good)).toBe(false);
    expect(verifyProof(key, "other message", good)).toBe(false);
  });

  it("格式不对的一律 false，不抛错（长度不对、大写、空、非十六进制）", () => {
    for (const bad of ["", good.slice(1), `${good}0`, good.toUpperCase(), "zz".repeat(32)]) {
      expect(verifyProof(key, message, bad)).toBe(false);
    }
  });
});
