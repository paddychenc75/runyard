import { parseVersionRange } from "@runyard/protocol";

// 版本号与范围的判定（规格 TOOLCHAIN-DETECTION-08、09）。范围的写法由协议包的 parseVersionRange 管，
// 这里只回答“某个版本落在哪里”。
// 比较只看范围里写了几段：`>=22.18` 只比前两段，所以 22.18.3 满足；`<27` 的 27.0.0 不满足（已经到上限）；
// `<=27` 的 27.3.0 满足；`>22` 的 22.5.0 不满足。这样“22”“22.18”这类写法不需要补零的约定。

export type VersionVerdict = "ok" | "too-old" | "untested";

/** 取开头的 1 到 3 段数字；开头不是数字返回 null（此时不算解析出了版本号） */
export function parseVersionNumbers(text: string): number[] | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text.trim());
  if (match === null) return null;
  return match
    .slice(1)
    .filter((part): part is string => part !== undefined)
    .map(Number);
}

function compareSegments(version: number[], bound: number[]): number {
  for (let i = 0; i < bound.length; i++) {
    const diff = (version[i] ?? 0) - (bound[i] as number);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * 低于下限是 too-old（拦住）；满足下限但越过上限是 untested（照常运行，给提醒）。
 * 范围或版本写法无法解析时按 ok 处理：写法错误由模板检查拦在发布之前，这里不拿它挡用户。
 */
export function judgeVersion(range: string, version: string): VersionVerdict {
  const parsed = parseVersionRange(range);
  const numbers = parseVersionNumbers(version);
  if (!parsed.ok || numbers === null) return "ok";
  let untested = false;
  for (const { operator, version: boundText } of parsed.comparators) {
    const bound = parseVersionNumbers(boundText) as number[];
    const order = compareSegments(numbers, bound);
    if (operator === ">=" && order < 0) return "too-old";
    if (operator === ">" && order <= 0) return "too-old";
    if (operator === "<" && order >= 0) untested = true;
    if (operator === "<=" && order > 0) untested = true;
  }
  return untested ? "untested" : "ok";
}
