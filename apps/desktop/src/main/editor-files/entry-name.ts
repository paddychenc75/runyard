import type { NameProblem } from "../../shared/editor-files.ts";

// 新名字的校验（规格 DESKTOP-EDITOR-08）：空、含 `/`、是 `.` 或 `..`。
// 另外拒绝 NUL 等控制字符和超过 255 字节的名字（文件系统本来就不接受，提前给明确的原因）。
// 校验在主进程做，不只在界面（技术设计 §6.5）。

const MAX_NAME_BYTES = 255;

export function checkEntryName(name: string): NameProblem | null {
  if (name.trim() === "") return "empty";
  if (name.includes("/") || name.includes("\\")) return "separator";
  if (name === "." || name === "..") return "dot";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 就是要找控制字符
  if (/[\u0000-\u001f\u007f]/.test(name)) return "control";
  if (Buffer.byteLength(name, "utf8") > MAX_NAME_BYTES) return "too-long";
  return null;
}
