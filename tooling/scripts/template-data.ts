import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  lintTemplate,
  parseToolDefinitions,
  type TemplateFolder,
} from "../../packages/core/src/templates/index.ts";
import { type LintResult, validateRunner } from "../../packages/protocol/src/index.ts";

// 仓库里 templates/ 的数据检查（技术设计 §3.1 的目录：builtin/<id>/、runners/<id>/、tools/<tool>.json）：
// 工具定义全部合格；每个运行器通过校验；每个内置模板通过 template lint。
// `pnpm template:lint` 和 `pnpm check` 的 template-data 都用这里。以后命令行的 template lint
// 用同一个 core 里的 lintTemplate，只是文件夹由平台层读。

export interface TemplateDataReport {
  readonly toolIds: readonly string[];
  readonly results: readonly LintResult[];
  /** 不属于某个模板的问题（工具定义、运行器、文件夹名对不上），每条是一句指令 */
  readonly problems: readonly string[];
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function filesUnder(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

function readFolder(dir: string): TemplateFolder {
  const filesDir = join(dir, "files");
  const names = new Set(existsSync(filesDir) ? filesUnder(filesDir) : []);
  return {
    templateJson: readFileSync(join(dir, "template.json"), "utf8"),
    has: (path) => names.has(path),
    text: (path) => (names.has(path) ? readFileSync(join(filesDir, path), "utf8") : undefined),
  };
}

export function checkTemplateData(root: string): TemplateDataReport {
  const base = join(root, "templates");
  const problems: string[] = [];

  const toolsDir = join(base, "tools");
  const sources = existsSync(toolsDir)
    ? readdirSync(toolsDir)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => ({ file, text: readFileSync(join(toolsDir, file), "utf8") }))
    : [];
  const tools = parseToolDefinitions(sources);
  for (const p of tools.problems)
    problems.push(
      `templates/tools/${p.file} 不合格（${p.kind}：${p.details.join("；")}）。按 packages/protocol/src/tool-definition.ts 改。`,
    );

  const runners = new Map<string, unknown>();
  for (const id of subdirs(join(base, "runners"))) {
    const file = join(base, "runners", id, "runner.json");
    if (!existsSync(file)) {
      problems.push(`templates/runners/${id}/ 里没有 runner.json。加上，或删掉这个文件夹。`);
      continue;
    }
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    runners.set(id, raw);
    const checked = validateRunner(raw);
    for (const issue of checked.errors)
      problems.push(
        `templates/runners/${id}/runner.json ${issue.path}：${issue.rule}，${issue.message}。`,
      );
    if (checked.value !== undefined && checked.value.id !== id)
      problems.push(
        `templates/runners/${id}/runner.json 的 id 是 ${checked.value.id}，要和文件夹名一致。`,
      );
  }

  const results: LintResult[] = [];
  for (const id of subdirs(join(base, "builtin"))) {
    const result = lintTemplate({
      folder: readFolder(join(base, "builtin", id)),
      builtin: true,
      runners,
      knownTools: new Set(tools.definitions.keys()),
      fallbackName: id,
    });
    results.push(result);
    if (result.template !== id)
      problems.push(`templates/builtin/${id}/ 的模板 id 是 ${result.template}，要和文件夹名一致。`);
  }
  return { toolIds: [...tools.definitions.keys()], results, problems };
}

if (import.meta.main) {
  const report = checkTemplateData(join(import.meta.dirname, "..", ".."));
  for (const result of report.results) console.log(JSON.stringify(result));
  for (const problem of report.problems) console.error(problem);
  const failed = report.problems.length > 0 || report.results.some((result) => !result.ok);
  process.exitCode = failed ? 2 : 0;
}
