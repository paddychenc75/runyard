import { type MessageFormatElement, TYPE } from "@formatjs/icu-messageformat-parser";
import { type CodeEntry, type CodeRegistries, codeEntries, codeKeyOf } from "./code-families.ts";
import { isAutoParam } from "./icu-params.ts";
import { type ArgUse, argUses, parseMessage } from "./icu-structure.ts";

// i18n-codes 的实现，仓库检查（tooling/checks/i18n-codes.ts）和包内测试（code-texts.test.ts）共用：
// protocol 登记的每个错误码、提示码、运行状态在每种语言里都有文案，
// 文案用的参数和登记表一致。纯函数：吃“语言 → 键 → 文案”和登记表，吐问题列表。
//
// 可选参数的约定（登记表里 `exitCode?: number` 这类）：ICU 对缺失的参数会抛错，所以文案里必须写成
// `{exitCode, select, none {} other {…{exitCode}…}}`——翻译函数发现 select 有 none 分支而参数缺失时，
// 自动传 "none"（message-format.ts）。没有 none 分支的可选参数、写在 other 分支之外的引用，都会在这里被拦下。

export type Texts = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface CodeProblem {
  locale: string;
  key: string;
  message: string;
}

export const NONE_BRANCH = "none";

function guardedViolations(
  elements: MessageFormatElement[],
  optional: ReadonlySet<string>,
  guarded: ReadonlySet<string>,
  out: Set<string>,
): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        if (optional.has(element.value) && !guarded.has(element.value)) out.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural: {
        const hasNone = element.type === TYPE.select && NONE_BRANCH in element.options;
        if (optional.has(element.value) && !hasNone && !guarded.has(element.value)) {
          out.add(element.value);
        }
        for (const [branch, option] of Object.entries(element.options)) {
          // none 分支里参数一定缺失，other 分支里一定在，所以只有 other 分支算受保护
          const inner =
            hasNone && optional.has(element.value) && branch !== NONE_BRANCH
              ? new Set([...guarded, element.value])
              : guarded;
          guardedViolations(option.value, optional, inner, out);
        }
        break;
      }
      case TYPE.tag:
        guardedViolations(element.children, optional, guarded, out);
        break;
      default:
        break;
    }
  }
}

function namesIn(message: string): string[] {
  try {
    return argUses(message).map((use) => use.name);
  } catch {
    return []; // 不是合法 ICU 由 i18n-keys 报
  }
}

function checkEntryText(entry: CodeEntry, message: string): string[] {
  let uses: ArgUse[];
  try {
    uses = argUses(message);
  } catch {
    return []; // 不是合法 ICU 由 i18n-keys 报
  }
  const problems: string[] = [];
  const known = Object.keys(entry.params);
  for (const use of uses) {
    if (isAutoParam(use.name)) continue;
    if (!known.includes(use.name)) {
      problems.push(
        `用了登记表里没有的参数 {${use.name}}。去掉它，或先在 packages/protocol 的登记表里给 ${entry.code} 加上这个参数。`,
      );
    }
  }
  for (const [name, info] of Object.entries(entry.params)) {
    const selects = uses.filter((use) => use.name === name && use.kind === "select");
    if (info.values !== undefined) {
      const allowed = new Set([...info.values, "other", ...(info.optional ? [NONE_BRANCH] : [])]);
      for (const select of selects) {
        for (const branch of select.options) {
          if (!allowed.has(branch)) {
            problems.push(
              `{${name}, select} 的分支 ${branch} 不是登记的取值（${info.values.join("、")}）。改成登记表里的取值，或用 other。`,
            );
          }
        }
      }
    }
    if (info.optional) {
      const used = uses.some((use) => use.name === name);
      if (used) {
        const bad = new Set<string>();
        guardedViolations(parseMessage(message), new Set([name]), new Set(), bad);
        if (bad.size > 0) {
          problems.push(
            `可选参数 {${name}} 没有按约定写。写成 {${name}, select, none {} other {…{${name}}…}}：参数缺失时翻译函数传 "none"，没有 none 分支 ICU 会抛错。`,
          );
        }
      }
    } else if (
      selects.some((use) => use.options.includes(NONE_BRANCH)) &&
      !info.values?.includes(NONE_BRANCH)
    ) {
      problems.push(
        `必填参数 {${name}} 的 select 里写了 none 分支，它永远走不到。none 分支只给登记表里的可选参数用。`,
      );
    }
  }
  return problems;
}

export function checkCodeTexts(texts: Texts, registries: CodeRegistries): CodeProblem[] {
  const entries = codeEntries(registries);
  const expected = new Set(entries.map((entry) => entry.key));
  const problems: CodeProblem[] = [];
  const add = (locale: string, key: string, message: string) =>
    problems.push({ locale, key, message });

  for (const [locale, messages] of Object.entries(texts)) {
    for (const entry of entries) {
      if (!(entry.key in messages)) {
        add(
          locale,
          entry.key,
          `${locale} 缺少 ${entry.key} 的文案（protocol 登记了 ${entry.code}）。在 packages/i18n/locales/${locale}/ 里补上，写法见 docs/guides/add-ui-string.md。`,
        );
      }
    }
    for (const key of Object.keys(messages)) {
      if (codeKeyOf(key) && !expected.has(key)) {
        add(
          locale,
          key,
          `${locale} 里有 ${key}，但 protocol 的登记表里没有对应的代码。代码已删除或写错了名字：删掉这条文案，或改成登记的代码。`,
        );
      }
    }
    // 必填参数要在同一个代码的文案里出现（错误码的四个字段合起来算）
    const groups = new Map<string, CodeEntry[]>();
    for (const entry of entries) {
      groups.set(`${entry.family}.${entry.code}`, [
        ...(groups.get(`${entry.family}.${entry.code}`) ?? []),
        entry,
      ]);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (first === undefined) continue;
      const used = new Set<string>();
      for (const entry of group) {
        const message = messages[entry.key];
        if (message === undefined) continue;
        for (const problem of checkEntryText(entry, message)) add(locale, entry.key, problem);
        for (const name of namesIn(message)) used.add(name);
      }
      for (const [name, info] of Object.entries(first.params)) {
        if (!info.optional && !used.has(name) && group.some((entry) => entry.key in messages)) {
          add(
            locale,
            first.key,
            `${locale} 的 ${group.length > 1 ? `errors.${first.code}.*` : first.key} 没有用到必填参数 {${name}}。登记表要求它出现在文案里：补上，或先在登记表里把它改成可选。`,
          );
        }
      }
    }
  }
  return problems;
}
