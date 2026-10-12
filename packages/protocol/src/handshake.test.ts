import { describe, expect, it } from "vitest";
import {
  type ComputeProof,
  challengeSchema,
  HANDSHAKE_PREFIX,
  helloSchema,
  nonceSchema,
  proofMessage,
  readySchema,
} from "./handshake.ts";

const nonce = "ab".repeat(32);
const clientNonce = "cd".repeat(32);
const proof = "ef".repeat(32);

const challenge = { t: "challenge", nonce, protocol: 1, minProtocol: 1 };
const hello = {
  t: "hello",
  clientNonce,
  proof,
  protocol: 1,
  minProtocol: 1,
  client: { kind: "cli", build: "1.0.0+aaa", pid: 4242 },
};
const ready = { t: "ready", proof, build: "1.0.0+aaa" };

describe("握手消息", () => {
  it("三条消息的合法样例通过", () => {
    expect(challengeSchema.safeParse(challenge).success).toBe(true);
    expect(helloSchema.safeParse(hello).success).toBe(true);
    expect(readySchema.safeParse(ready).success).toBe(true);
  });

  it("[PROTOCOL-HANDSHAKE-04] nonce 与 clientNonce 不是恰好 32 字节就被拒", () => {
    const bad = [
      "",
      "ab".repeat(31),
      "ab".repeat(33),
      "AB".repeat(32),
      "zz".repeat(32),
      `${"ab".repeat(32)}\n`,
    ];
    for (const value of bad) {
      expect(nonceSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
      expect(challengeSchema.safeParse({ ...challenge, nonce: value }).success).toBe(false);
      expect(helloSchema.safeParse({ ...hello, clientNonce: value }).success).toBe(false);
    }
  });

  it("[PROTOCOL-HANDSHAKE-05] 空 nonce 被拒；两个方向的摘要输入不同，回传的应答不能当服务端证明", () => {
    expect(challengeSchema.safeParse({ ...challenge, nonce: "" }).success).toBe(false);
    expect(proofMessage("client", nonce, clientNonce)).not.toBe(
      proofMessage("server", nonce, clientNonce),
    );
  });

  it("缺字段、类型不对、未知种类被拒", () => {
    expect(challengeSchema.safeParse({ ...challenge, protocol: 0 }).success).toBe(false);
    expect(challengeSchema.safeParse({ t: "challenge", nonce }).success).toBe(false);
    expect(
      helloSchema.safeParse({ ...hello, client: { ...hello.client, kind: "web" } }).success,
    ).toBe(false);
    expect(helloSchema.safeParse({ ...hello, client: { kind: "cli", build: "x" } }).success).toBe(
      false,
    );
    expect(helloSchema.safeParse({ ...hello, proof: "ef" }).success).toBe(false);
    expect(readySchema.safeParse({ t: "ready", proof }).success).toBe(false);
    expect(readySchema.safeParse({ ...ready, t: "hello" }).success).toBe(false);
  });

  it("未知字段被忽略（形状永不改变，只许加可选字段）", () => {
    expect(readySchema.parse({ ...ready, clientId: "c1" })).toEqual(ready);
  });
});

describe("摘要输入", () => {
  it("固定前缀、方向标记、两个 nonce 按顺序拼接", () => {
    expect(proofMessage("client", nonce, clientNonce)).toBe(
      `runyard-handshake-1|client|${nonce}${clientNonce}`,
    );
    expect(HANDSHAKE_PREFIX).toBe("runyard-handshake-1|");
  });

  it("ComputeProof 可以用假实现注入", () => {
    const fake: ComputeProof = (key, message) =>
      `${key.length.toString(16).padStart(2, "0")}${message.length.toString(16)}`.padEnd(64, "0");
    const out = fake(new Uint8Array(32), proofMessage("server", nonce, clientNonce));
    expect(out).toHaveLength(64);
  });
});
