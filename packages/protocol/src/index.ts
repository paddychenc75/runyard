import { z } from "zod";

// 协议版本号：跨进程握手时双方比对（占位的最小导出，证明整条流水线是通的）
export const PROTOCOL_VERSION = 1;

// 版本号的数据校验定义；协议里所有消息和文件格式都用 zod 定义（技术设计 §3.2）
export const protocolVersionSchema = z.number().int().positive();

export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;
