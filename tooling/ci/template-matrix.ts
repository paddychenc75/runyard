// 模板 CI 的矩阵（技术设计 §8.3；规格 TEMPLATES-FORMAT-58）：根据 templates/builtin/ 里现有的模板和每个模板的
// requires，算出要在哪些系统、哪些工具版本上跑 `pnpm template:smoke`。矩阵由数据生成：
// 新增模板只要把文件夹放进 templates/builtin/，下一次运行就自动带上，不用改工作流或本脚本。
//
// 用法（在仓库根目录）：
//   node tooling/ci/template-matrix.ts --mode pr --base <提交> --head <提交>   # 只测改动的模板，只用版本上限
//   node tooling/ci/template-matrix.ts --mode pr --all                         # 全部模板，只用版本上限（手动触发）
//   node tooling/ci/template-matrix.ts --mode nightly                          # 全部模板，上限和下限
// 标准输出是一行 JSON：{"include":[{template,kind,os,bound,node,python,go,pnpm},…]}，空矩阵是 {"include":[]}。

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TOOLS = ["node", "pnpm", "python", "go"] as const;
export type ToolName = (typeof TOOLS)[number];

export type Bound = "upper" | "lower";
export type SmokeKind = "server" | "script" | "static";

export interface TemplateInfo {
  readonly id: string;
  readonly kind: SmokeKind;
  readonly requires: Readonly<Record<string, { readonly version: string }>>;
}

export interface Toolchains {
  readonly upper: Readonly<Record<ToolName, string>>;
  readonly os: readonly string[];
}

export type MatrixEntry = {
  readonly template: string;
  readonly kind: SmokeKind;
  readonly os: string;
  readonly bound: Bound;
} & Record<ToolName, string>;

// 声明范围的下界补成 X.Y.0：">=22.18<27" 是 22.18.0，">=1.26<2" 是 1.26.0
export function lowerBound(range: string): string | undefined {
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range.trim());
  if (match === null) return undefined;
  return `${match[1]}.${match[2] ?? "0"}.${match[3] ?? "0"}`;
}

function versionsOf(template: TemplateInfo, bound: Bound, toolchains: Toolchains) {
  const versions: Record<ToolName, string> = { node: "", pnpm: "", python: "", go: "" };
  for (const [tool, requirement] of Object.entries(template.requires)) {
    if (!(TOOLS as readonly string[]).includes(tool)) {
      throw new Error(
        `模板 ${template.id} 要求了工具 ${tool}，模板 CI 还不认识它：在 tooling/ci/template-matrix.ts 的 TOOLS 和 tooling/ci/template-toolchains.json 里加上。`,
      );
    }
    const name = tool as ToolName;
    if (bound === "upper") {
      versions[name] = toolchains.upper[name];
      continue;
    }
    const lower = lowerBound(requirement.version);
    if (lower === undefined) {
      throw new Error(`模板 ${template.id} 的 ${tool} 范围 ${requirement.version} 读不出下界`);
    }
    versions[name] = lower;
  }
  return versions;
}

export function buildMatrix(input: {
  readonly templates: readonly TemplateInfo[];
  readonly toolchains: Toolchains;
  readonly mode: "pr" | "nightly";
  /** 只测这些模板；缺省是全部 */
  readonly only?: ReadonlySet<string>;
}): { include: MatrixEntry[] } {
  const bounds: Bound[] = input.mode === "pr" ? ["upper"] : ["upper", "lower"];
  const include: MatrixEntry[] = [];
  for (const template of [...input.templates].sort((a, b) => a.id.localeCompare(b.id))) {
    if (input.only !== undefined && !input.only.has(template.id)) continue;
    for (const os of input.toolchains.os) {
      for (const bound of bounds) {
        include.push({
          template: template.id,
          kind: template.kind,
          os,
          bound,
          ...versionsOf(template, bound, input.toolchains),
        });
      }
    }
  }
  return { include };
}

const TEMPLATE_FOLDER = /^templates\/builtin\/([^/]+)\//;
// 这些文件一变，所有模板都可能受影响
const AFFECTS_ALL = [
  /^templates\/(runners|tools)\//,
  /^tooling\/scripts\/template-(smoke|data)[^/]*\.ts$/,
  /^tooling\/ci\/template-/,
  /^\.github\/workflows\/template/,
];

/** 返回受影响的模板标识；null 表示全部 */
export function affectedTemplates(files: readonly string[]): Set<string> | null {
  const ids = new Set<string>();
  for (const file of files) {
    if (AFFECTS_ALL.some((pattern) => pattern.test(file))) return null;
    const match = TEMPLATE_FOLDER.exec(file);
    if (match?.[1] !== undefined) ids.add(match[1]);
  }
  return ids;
}

function smokeKind(runnerKind: string): SmokeKind {
  if (runnerKind === "oneshot") return "script";
  return runnerKind === "static" ? "static" : "server";
}

export function readTemplates(root: string): TemplateInfo[] {
  const builtin = join(root, "templates", "builtin");
  return readdirSync(builtin, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const template = JSON.parse(readFileSync(join(builtin, entry.name, "template.json"), "utf8"));
      const runner = JSON.parse(
        readFileSync(join(root, "templates", "runners", template.runner, "runner.json"), "utf8"),
      );
      return { id: entry.name, kind: smokeKind(runner.kind), requires: template.requires ?? {} };
    });
}

function option(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

function main(argv: readonly string[]): number {
  const root = join(import.meta.dirname, "..", "..");
  const mode = option(argv, "mode");
  if (mode !== "pr" && mode !== "nightly") {
    console.error("用法：--mode pr (--base <提交> --head <提交> | --all) 或 --mode nightly");
    return 2;
  }
  let only: Set<string> | undefined;
  if (mode === "pr" && !argv.includes("--all")) {
    const base = option(argv, "base");
    const head = option(argv, "head");
    if (base === undefined || head === undefined) {
      console.error("pr 模式要给 --base 和 --head");
      return 2;
    }
    const files = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line !== "");
    only = affectedTemplates(files) ?? undefined;
  }
  const toolchains = JSON.parse(
    readFileSync(join(root, "tooling", "ci", "template-toolchains.json"), "utf8"),
  ) as Toolchains;
  const matrix = buildMatrix({
    templates: readTemplates(root),
    toolchains,
    mode,
    ...(only === undefined ? {} : { only }),
  });
  console.log(JSON.stringify(matrix));
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
