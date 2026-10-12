import { platformError } from "../platform-error.ts";

// 还没实现的成员。接口一次定全，各块实现随后续 issue 逐块替换这里的占位：
// 谁实现某一块，谁就把这里对应的占位换成真实现，并把契约测试里 pending.contract.ts 对应的行换成真用例。
// 占位抛 INTERNAL（它是缺陷，不是“系统不支持”）；真正的“不支持”是 NOT_SUPPORTED（见 linux/）。

export function notImplemented(member: string, owner: string): never {
  throw platformError("INTERNAL", {}, `platform.${member} is not implemented yet (${owner})`);
}

export function unsupported(member: string, system: string): never {
  throw platformError("NOT_SUPPORTED", {}, `platform.${member} is not supported on ${system}`);
}
