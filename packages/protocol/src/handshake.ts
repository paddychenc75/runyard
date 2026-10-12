import { z } from "zod";
import { protocolVersionSchema } from "./protocol-version.ts";

// 握手（决策记录 0005；docs/architecture/protocol.md §2）。
// 这里只有三条消息的形状、字段格式和“对什么做摘要”；真正的 HMAC 在平台层的 ipc 里
// （protocol 不许用 Node 接口，client 又不能导入 core），通过 ComputeProof 注入。

// 摘要的固定前缀。末尾的 1 是握手格式的版本，换算法或拼接方式时才改，与协议版本无关
export const HANDSHAKE_PREFIX = "runyard-handshake-1|";

export const NONCE_BYTES = 32;

// nonce、clientNonce、proof 在线上都是小写十六进制字符串：32 字节恰好 64 个字符。
// 长度检查放在 schema 里，空的、短的、长的、大写或带别的字符的一律被拒（规格 PROTOCOL-HANDSHAKE-04、05）
const hexBytes = (bytes: number) => z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`));
export const nonceSchema = hexBytes(NONCE_BYTES);
// HMAC-SHA256 的输出是 32 字节
export const PROOF_BYTES = 32;
export const proofSchema = hexBytes(PROOF_BYTES);

const buildSchema = z.string().min(1);

// 第 1 步：管理进程到客户端
export const challengeSchema = z.object({
  t: z.literal("challenge"),
  nonce: nonceSchema,
  protocol: protocolVersionSchema,
  minProtocol: protocolVersionSchema,
});
export type Challenge = z.infer<typeof challengeSchema>;

export const clientKindSchema = z.enum(["app", "cli"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

// 第 2 步：客户端到管理进程。身份字段 client 放在这一条里，因为管理进程要在回 ready 之前知道对方是谁
export const helloSchema = z.object({
  t: z.literal("hello"),
  clientNonce: nonceSchema,
  proof: proofSchema,
  protocol: protocolVersionSchema,
  minProtocol: protocolVersionSchema,
  client: z.object({
    kind: clientKindSchema,
    build: buildSchema,
    pid: z.number().int().positive(),
  }),
});
export type Hello = z.infer<typeof helloSchema>;

// 第 3 步：管理进程到客户端。build 是管理进程自己的构建标识，客户端靠它做版本比对
// （发现文件里也有，但原地替换应用后以握手里报的为准）
export const readySchema = z.object({
  t: z.literal("ready"),
  proof: proofSchema,
  build: buildSchema,
});
export type Ready = z.infer<typeof readySchema>;

export type HandshakeMessage = Challenge | Hello | Ready;

export type ProofDirection = "client" | "server";

// 摘要的输入。两个方向前缀不同，两个 nonce 定长（64 个字符），所以直接拼接没有歧义
export function proofMessage(
  direction: ProofDirection,
  nonce: string,
  clientNonce: string,
): string {
  return `${HANDSHAKE_PREFIX}${direction}|${nonce}${clientNonce}`;
}

// HMAC-SHA256(key, message)，返回小写十六进制。实现由平台层的 ipc 提供，测试里用假的
export type ComputeProof = (key: Uint8Array, message: string) => string;
