import type { NameProblem } from "@runyard/platform";
import { libraryError } from "./library-error.ts";

// 名称校验的规则本身只有一份，在平台层（paths.validateName）；这里只把问题码对应到错误码，
// 并按“模板标识加序号”挑默认名。

/** 校验在产生任何副作用之前做；保留名是 NAME_RESERVED，其余是 NAME_INVALID */
export function assertValidName(
  validate: (name: string) => NameProblem | null,
  name: string,
): void {
  const problem = validate(name);
  if (problem === null) return;
  if (problem === "reserved") {
    throw libraryError("NAME_RESERVED", { name }, `reserved name: ${JSON.stringify(name)}`);
  }
  throw libraryError(
    "NAME_INVALID",
    { name },
    `invalid name (${problem}): ${JSON.stringify(name)}`,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 默认名：模板标识 + “-” + (现存同模板名称里最大的序号 + 1)，没有就是 1。
 * 不记已删除的序号，也不补空缺（PRD #prd-naming；现有 react19-1、react19-3，下一个是 react19-4）。
 */
export function nextDefaultName(templateId: string, existingNames: Iterable<string>): string {
  const pattern = new RegExp(`^${escapeRegExp(templateId)}-(\\d+)$`);
  let highest = 0;
  for (const name of existingNames) {
    const digits = pattern.exec(name)?.[1];
    if (digits === undefined) continue;
    const sequence = Number(digits);
    if (Number.isSafeInteger(sequence) && sequence > highest) highest = sequence;
  }
  return `${templateId}-${highest + 1}`;
}
