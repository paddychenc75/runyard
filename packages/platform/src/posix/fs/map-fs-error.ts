import { basename } from "node:path";
import { isPlatformError, type PlatformError, platformError } from "../../platform-error.ts";

// 系统的文件错误码翻成协议的错误码（决策记录 0010 第 4 条）。
// 只翻有对应说法的：被占用或没权限是 PATH_LOCKED，名字或路径太长是 PATH_TOO_LONG；
// 其余（磁盘满、IO 错误等）是意料之外的，抛 INTERNAL，系统错误码只放进给日志的 debug。

export function errnoOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const LOCKED = new Set(["EBUSY", "EPERM", "EACCES"]);

/** 把 fs 抛出的错误变成要抛的 PlatformError；已经是 PlatformError 的原样返回 */
export function fsError(error: unknown, path: string, action: string): PlatformError {
  if (isPlatformError(error)) return error;
  const code = errnoOf(error);
  const name = basename(path);
  const debug = `${action} ${path}: ${code ?? String(error)}`;
  if (code !== undefined && LOCKED.has(code)) return platformError("PATH_LOCKED", { name }, debug);
  if (code === "ENAMETOOLONG") return platformError("PATH_TOO_LONG", { name }, debug);
  return platformError("INTERNAL", {}, debug);
}
