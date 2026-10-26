import { listFiles, readText } from "./docs.ts";
import { capabilityPrefix, type ParsedSpec, readSpecs, SCENARIO_ID } from "./spec-scenarios.ts";
import type { Check } from "./workspace.ts";

// spec-trace：规格里的场景和测试对得上（技术设计 §9.6.9）。
// 拦住：场景没有编号或编号重复；编号前缀和能力路径对不上；没有写“验证：”；
// 标了“验证：test”的场景没有测试引用它；测试标题引用了不存在的编号；“验证：manual”后面没写原因。
//
// 规格按里程碑批准、代码按 issue 陆续实现，所以“还没有测试”的场景登记在
// tooling/checks/spec-pending.txt（每行一个编号，# 开头是注释）。清单只许缩小：
// 登记的场景已经有测试了、或者编号不存在、或者不是 test 场景，都算错，逼着实现的人把它删掉。
// 技术设计没有写这份清单；这是为了不让尚未实现的场景一开始就把构建挡死而加的最小做法。
//
// 它只能证明“有测试的标题提到了这个编号”，不能证明测试真的验证了场景，那一点靠 spec-reviewer 和评审。

export const PENDING_FILE = "tooling/checks/spec-pending.txt";
const TEST_FILE = /^(packages|apps|tooling)\/.*\.test\.tsx?$/;
// 与桌面 Playwright 的正式入口保持一致；取证/夹具脚本不能代替实际执行的测试。
const DESKTOP_E2E_FILE = /^apps\/desktop\/e2e\/[^/]+\.e2e\.ts$/;
const TEST_CALL = /\b(?:it|test|describe)\b[^"'`]*["'`](.*)$/;
// 能力路径是两级，所以编号的前缀至少两段（RUN-OWNERSHIP-01）；一段的写法（X-01）是别处的记号，不当场景编号
const ID_IN_TITLE = /\[([A-Z0-9]+(?:-[A-Z0-9]+)+-\d{2,})\]/g;

export function parsePending(text: string): { ids: Map<string, number>; errors: string[] } {
  const ids = new Map<string, number>();
  const errors: string[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") return;
    if (!SCENARIO_ID.test(`[${line}]`)) {
      errors.push(
        `${PENDING_FILE}:${index + 1} 不是场景编号：${line}。每行只写一个编号，如 RUN-OWNERSHIP-01。`,
      );
      return;
    }
    if (ids.has(line))
      errors.push(`${PENDING_FILE}:${index + 1} 编号 ${line} 重复登记。删掉多余的一行。`);
    ids.set(line, index + 1);
  });
  return { ids, errors };
}

// 测试文件里，测试标题（it / test / describe 的第一个字符串）中引用的编号
export function referencedIds(files: Record<string, string>): Map<string, string> {
  const found = new Map<string, string>();
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, index) => {
      const title = TEST_CALL.exec(line)?.[1];
      if (title === undefined) return;
      for (const match of title.matchAll(ID_IN_TITLE)) {
        if (!found.has(match[1] as string)) found.set(match[1] as string, `${file}:${index + 1}`);
      }
    });
  }
  return found;
}

export function checkSpecTrace(
  specs: ParsedSpec[],
  tests: Record<string, string>,
  pendingText: string,
): string[] {
  const { ids: pending, errors } = parsePending(pendingText);
  const referenced = referencedIds(tests);
  const seen = new Map<string, string>();
  const testScenarios = new Set<string>();
  for (const spec of specs) {
    const prefix = capabilityPrefix(spec.capability);
    for (const requirement of spec.requirements) {
      for (const scenario of requirement.scenarios) {
        const where = `${spec.file}:${scenario.line}`;
        if (scenario.id === null) {
          errors.push(
            `${where} 场景标题没有编号。标题写成 “#### Scenario: [${prefix}-NN] 场景名”。`,
          );
        } else {
          const first = seen.get(scenario.id);
          if (first !== undefined) {
            errors.push(
              `${where} 编号 ${scenario.id} 与 ${first} 重复。编号起了就不改、不复用：给新场景取下一个没用过的编号。`,
            );
          }
          seen.set(scenario.id, where);
          if (!new RegExp(`^${prefix}-\\d{2,}$`).test(scenario.id)) {
            errors.push(
              `${where} 编号 ${scenario.id} 的前缀和能力路径 ${spec.capability} 对不上。前缀应是 ${prefix}。`,
            );
          }
        }
        if (scenario.verify === null) {
          errors.push(
            `${where} 场景最后没有“验证：”一行。补上“- 验证：test”或“- 验证：manual（原因）”。`,
          );
        } else if (scenario.verify === "manual" && scenario.reason.trim() === "") {
          errors.push(
            `${where} “验证：manual”后面没写原因。写成“- 验证：manual（为什么不能自动测）”。`,
          );
        } else if (scenario.verify === "test" && scenario.id !== null) {
          testScenarios.add(scenario.id);
          const hasTest = referenced.has(scenario.id);
          const listed = pending.has(scenario.id);
          if (!hasTest && !listed) {
            errors.push(
              `${where} 场景 ${scenario.id} 标了“验证：test”，但没有测试的标题引用它。写一个标题带 [${scenario.id}] 的测试；还没轮到实现就登记到 ${PENDING_FILE}。`,
            );
          }
          if (hasTest && listed) {
            errors.push(
              `${PENDING_FILE}:${pending.get(scenario.id)} 场景 ${scenario.id} 已经有测试（${referenced.get(scenario.id)}）。从清单里删掉这一行。`,
            );
          }
        }
      }
    }
  }
  for (const [id, line] of pending) {
    if (!testScenarios.has(id) && !seen.has(id)) {
      errors.push(`${PENDING_FILE}:${line} 编号 ${id} 在规格里不存在。删掉这一行。`);
    } else if (!testScenarios.has(id)) {
      errors.push(`${PENDING_FILE}:${line} 场景 ${id} 不是“验证：test”。删掉这一行。`);
    }
  }
  for (const [id, where] of referenced) {
    if (!seen.has(id)) {
      errors.push(
        `${where} 测试标题引用了规格里不存在的编号 ${id}。核对编号；规格写错了就停下来报告，不要自己改规格。`,
      );
    }
  }
  return errors;
}

export const specTrace: Check = {
  name: "spec-trace",
  run(root) {
    const files = listFiles(root);
    const tests: Record<string, string> = {};
    for (const file of files.filter((path) => TEST_FILE.test(path) || DESKTOP_E2E_FILE.test(path)))
      tests[file] = readText(root, file);
    const pending = files.includes(PENDING_FILE) ? readText(root, PENDING_FILE) : "";
    return checkSpecTrace(readSpecs(root), tests, pending);
  },
};
