import { createHmac, timingSafeEqual } from "node:crypto";
import { PROOF_BYTES } from "@runyard/protocol";

// 握手的证明函数（protocol 只定义形状，HMAC 在这里；协议见 docs/architecture/protocol.md §2，决策记录 0005）。
// 与系统无关，darwin 和 linux 共用。

export function computeProof(key: Uint8Array, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

const PROOF_FORMAT = new RegExp(`^[0-9a-f]{${PROOF_BYTES * 2}}$`);

// 常量时间比较：用普通的字符串相等会因为第一个不同的位置不同而泄露时间差。
// 格式不对的先拒掉（timingSafeEqual 要求等长，长度本身不是秘密）
export function verifyProof(key: Uint8Array, message: string, proof: string): boolean {
  if (!PROOF_FORMAT.test(proof)) return false;
  const expected = Buffer.from(computeProof(key, message), "hex");
  const given = Buffer.from(proof, "hex");
  return timingSafeEqual(expected, given);
}
