import { isAbsolute, join } from "node:path";
import { platformError } from "./platform-error.ts";

// 带标记的路径类型：普通字符串传不进来，必须经过下面的构造函数（技术设计 §7.1）。
// 标记只存在于类型里，运行时就是字符串。

/** 本机格式的绝对路径（macOS 和 Linux 用 `/`，以后的 Windows 带盘符和 `\`） */
export type AbsPath = string & { readonly __brand: "AbsPath" };

/** 永远用 `/` 分隔的相对路径：文件和消息里的相对路径都是这一种 */
export type PosixRelPath = string & { readonly __brand: "PosixRelPath" };

export function absPath(value: string): AbsPath {
  if (!isAbsolute(value)) {
    throw platformError("INTERNAL", {}, `not an absolute path: ${JSON.stringify(value)}`);
  }
  return value as AbsPath;
}

// 拒绝：空串、`\`、盘符、开头的 `/`、`.` 和 `..` 段、空段。这些在以后的 Windows 上都会变成逃出根目录的写法
export function posixRelPath(value: string): PosixRelPath {
  const segments = value.split("/");
  const bad =
    value === "" ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..");
  if (bad) {
    throw platformError("INTERNAL", {}, `not a posix relative path: ${JSON.stringify(value)}`);
  }
  return value as PosixRelPath;
}

// 用路径工具拼，不手写分隔符
export function joinPath(base: AbsPath, ...parts: PosixRelPath[]): AbsPath {
  return join(base, ...parts.flatMap((part) => part.split("/"))) as AbsPath;
}
