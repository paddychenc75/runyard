import { sep } from "node:path";
import type { LengthVerdict } from "../platform.ts";

// 路径长度分三档。上限由系统给：macOS 的 PATH_MAX 是 1024（含结尾的 NUL），Linux 是 4096；
// 以后的 Windows 默认 260，保守取 248（决策记录 0010）。单个名字另有 255 字节的上限（NAME_MAX）。
// “接近”取上限的八分之七：创建项目时给出警告，仍然继续（规格 LIBRARY-PLAYGROUNDS-05）。

export interface PathLimit {
  /** 整条路径的字节数上限（含结尾的 NUL） */
  maxBytes: number;
}

const NAME_MAX_BYTES = 255;

export function checkLength(path: string, limit: PathLimit): LengthVerdict {
  const bytes = Buffer.byteLength(path);
  const longestName = Math.max(...path.split(sep).map((part) => Buffer.byteLength(part)));
  if (bytes >= limit.maxBytes || longestName > NAME_MAX_BYTES) return "too-long";
  if (bytes >= (limit.maxBytes * 7) / 8) return "near-limit";
  return "ok";
}
