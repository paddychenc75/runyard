import type { NameProblem } from "../platform.ts";

// 项目名称既是显示名也是文件夹名。规则在所有系统上一致：即使在 macOS 上，
// 也拒绝 Windows 的保留名和末尾的点、空格，这样资源库以后能搬到 Windows
//（PRD #prd-naming，决策记录 0010：Windows 的改名操作本身会放过这些名字，只能由应用自己查）。

export const MAX_NAME_LENGTH = 64;

// con、prn、aux、nul、com1 到 com9、lpt1 到 lpt9。Windows 把“带扩展名”的写法也当设备名，
// 所以只比较第一个点之前的部分；设备名不分大小写
const RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ALLOWED = /^[a-z0-9-]+$/;

// 返回第一个发现的问题；顺序固定，同一个名字总得到同一个答案
export function validateName(name: string): NameProblem | null {
  if (name === "") return "empty";
  const stem = name.split(".")[0] as string;
  if (RESERVED_STEM.test(stem.trimEnd())) return "reserved";
  if (name.endsWith(".") || name.endsWith(" ")) return "trailing-dot-or-space";
  if ([...name].length > MAX_NAME_LENGTH) return "too-long";
  if (!ALLOWED.test(name)) return "invalid-chars";
  if (name.startsWith("-") || name.endsWith("-")) return "edge-hyphen";
  return null;
}
