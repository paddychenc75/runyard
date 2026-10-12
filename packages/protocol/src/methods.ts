import type { z } from "zod";
import { libraryMethods } from "./methods-library.ts";
import { logsMethods } from "./methods-logs.ts";
import { reservedMethods } from "./methods-reserved.ts";
import { runMethods } from "./methods-run.ts";
import { sessionMethods } from "./methods-session.ts";
import { toolchainMethods } from "./methods-toolchain.ts";

// 方法登记表：每个方法名只在这里（通过各组文件）定义一次。
// 处理函数、调用方、参考文档都从它推出；握手帧 challenge / hello 不在其中（handshake.ts）。
// 新增方法不升协议版本；改已有方法的入参出参是破坏性改动（见包的 AGENTS.md）。

export const methodRegistry = {
  ...sessionMethods,
  ...libraryMethods,
  ...runMethods,
  ...logsMethods,
  ...toolchainMethods,
  ...reservedMethods,
} as const;

export type MethodName = keyof typeof methodRegistry;
export type MethodParams<M extends MethodName> = z.infer<(typeof methodRegistry)[M]["params"]>;
export type MethodResult<M extends MethodName> = z.infer<(typeof methodRegistry)[M]["result"]>;

export const methodNames = Object.keys(methodRegistry) as MethodName[];

export function isMethodName(name: string): name is MethodName {
  return Object.hasOwn(methodRegistry, name);
}
