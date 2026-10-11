// 审计闸门（技术设计 §8.6.3）：读取 `pnpm audit --json` 的输出，
// 只统计 high 和 critical，按 security/allowlist.toml 过滤，发现过期或格式不对的条目也失败。
//
// 用法（在仓库根目录）：
//   pnpm audit --prod --json --ignore-registry-errors > audit.json
//   node tooling/ci/audit-gate.ts --file audit.json --lenient
//
// 选项：
//   --file <路径>     pnpm audit --json 的输出文件（必填；不读标准输入，Windows 上更稳）
//   --scope <范围>    允许清单里的 scope，默认 root；模板审计用 template:<id>
//   --include-dev     把只出现在开发依赖里的公告也算进来（每晚任务和模板审计用；PR 任务不加）
//   --lenient         输入为空或不是 JSON 时只警告、不失败（PR 任务配合 --ignore-registry-errors 用；
//                     每晚任务不加，这样“查不到”会变成红灯）
//   --report <路径>   把结果写成 Markdown（每晚任务拿它开 issue）
//   --allowlist <路径> 允许清单路径，默认 security/allowlist.toml
//   --today <日期>    测试用，覆盖“今天”（YYYY-MM-DD）
//
// 退出码：0 通过；1 有未放行的高危公告、过期条目或无法解析；2 命令行参数错误。
// pnpm audit 自己的退出码数值没有查证（未核实，技术设计 附录 B），所以不看它，只看 JSON 内容。

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAllowlist, parseAllowlist } from "../checks/allowlist.ts";

interface AuditFinding {
  version?: string;
  paths?: string[];
  dev?: boolean;
}

interface AuditAdvisory {
  findings?: AuditFinding[];
  title?: string;
  module_name?: string;
  severity?: string;
  github_advisory_id?: string;
  cves?: string[];
  patched_versions?: string;
  url?: string;
}

export interface GateOptions {
  scope: string;
  includeDev: boolean;
  today: Date;
}

export interface GateResult {
  failures: string[]; // 导致失败的原因
  waived: string[]; // 被允许清单放行的公告
  warnings: string[]; // 不失败、但要看的提示
  moderate: string[]; // moderate 公告（不挡，每晚列出，技术设计 §8.6.3 阈值表）
}

const BLOCKING = new Set(["high", "critical"]);

function describe(a: AuditAdvisory): string {
  const id = a.github_advisory_id ?? "未知编号";
  const fix = a.patched_versions ? `修复版本 ${a.patched_versions}` : "没有修复版本";
  return `${id}（${a.severity}）${a.module_name ?? "未知包"}：${a.title ?? ""}，${fix}`;
}

function isDevOnly(a: AuditAdvisory): boolean {
  const findings = a.findings ?? [];
  return findings.length > 0 && findings.every((f) => f.dev === true);
}

// 核心判断：输入已经解析好的 audit JSON 和允许清单文本，不碰文件系统，方便测试。
export function evaluate(audit: unknown, allowlistText: string, options: GateOptions): GateResult {
  const result: GateResult = { failures: [], waived: [], warnings: [], moderate: [] };

  // 允许清单本身有问题（缺字段、过期、期限超限）一律失败
  result.failures.push(...checkAllowlist(allowlistText, options.today));

  const advisories = (audit as { advisories?: Record<string, AuditAdvisory> } | null)?.advisories;
  if (advisories === null || typeof advisories !== "object") {
    result.failures.push(
      "审计输出里没有 advisories 字段，不是 pnpm audit --json 的格式；不能当作“没有漏洞”。",
    );
    return result;
  }

  const entries = parseAllowlist(allowlistText).entries.filter(
    (e) => e.scope === options.scope && e.id !== undefined,
  );
  const used = new Set<string>();

  for (const advisory of Object.values(advisories)) {
    const severity = advisory.severity ?? "";
    if (severity === "moderate") {
      result.moderate.push(describe(advisory));
      continue;
    }
    if (!BLOCKING.has(severity)) continue;
    if (!options.includeDev && isDevOnly(advisory)) {
      result.warnings.push(
        `只在开发依赖里，PR 闸门不统计（每晚任务会列出）：${describe(advisory)}`,
      );
      continue;
    }
    const ids = [advisory.github_advisory_id, ...(advisory.cves ?? [])]
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toUpperCase());
    const entry = entries.find((e) => ids.includes((e.id as string).toUpperCase()));
    if (entry !== undefined && entry.package === advisory.module_name) {
      used.add((entry.id as string).toUpperCase());
      result.waived.push(`${describe(advisory)}；放行至 ${entry.expires}（${entry.reason}）`);
      continue;
    }
    const hint =
      entry !== undefined
        ? `（允许清单里有同编号条目，但 package 写的是 ${entry.package}，与 ${advisory.module_name} 不符）`
        : "";
    const paths = advisory.findings?.flatMap((f) => f.paths ?? []).slice(0, 3) ?? [];
    result.failures.push(
      `未放行的${severity}公告：${describe(advisory)}${hint}。依赖路径示例：${paths.join(" ； ") || "无"}。` +
        "处理办法：升级到修复版本；确实无法升级时，按技术设计 §8.6.3 在 security/allowlist.toml 加条目（写理由和到期日）。",
    );
  }

  for (const entry of entries) {
    if (!used.has((entry.id as string).toUpperCase())) {
      result.warnings.push(
        `允许清单条目 ${entry.id}（${entry.package}）这次没有命中任何公告，上游已修复的话请删除它。`,
      );
    }
  }
  return result;
}

export function renderReport(result: GateResult): string {
  const section = (title: string, lines: string[]) =>
    lines.length === 0 ? "" : `### ${title}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`;
  const status = result.failures.length === 0 ? "通过" : "失败";
  return (
    `审计闸门结果：${status}\n\n` +
    section("失败原因", result.failures) +
    section("已放行（允许清单）", result.waived) +
    section("moderate 公告（30 天内处理）", result.moderate) +
    section("提示", result.warnings)
  );
}

function parseArgs(argv: string[]) {
  const args = {
    file: "",
    scope: "root",
    includeDev: false,
    lenient: false,
    report: "",
    allowlist: "",
    today: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} 后面缺少参数值`);
      return value;
    };
    if (arg === "--file") args.file = next();
    else if (arg === "--scope") args.scope = next();
    else if (arg === "--report") args.report = next();
    else if (arg === "--allowlist") args.allowlist = next();
    else if (arg === "--today") args.today = next();
    else if (arg === "--include-dev") args.includeDev = true;
    else if (arg === "--lenient") args.lenient = true;
    else throw new Error(`不认识的参数：${arg}`);
  }
  if (args.file === "") throw new Error("必须用 --file 指定 pnpm audit --json 的输出文件");
  return args;
}

function main(): number {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误：${(error as Error).message}`);
    return 2;
  }
  const root = join(import.meta.dirname, "..", "..");
  const allowlistPath = args.allowlist || join(root, "security", "allowlist.toml");
  const today = args.today ? new Date(`${args.today}T00:00:00Z`) : new Date();

  let raw = "";
  try {
    raw = readFileSync(args.file, "utf8").trim();
  } catch {
    // 文件不存在按“没有输出”处理
  }
  let audit: unknown = null;
  let parseError = "";
  if (raw === "") parseError = "审计输出为空";
  else {
    try {
      audit = JSON.parse(raw);
    } catch {
      parseError = `审计输出不是 JSON（前 200 个字符：${raw.slice(0, 200)}）`;
    }
  }

  let result: GateResult;
  if (parseError !== "") {
    if (args.lenient) {
      result = {
        failures: [],
        waived: [],
        moderate: [],
        warnings: [
          `${parseError}。--lenient 模式下按“注册表暂时不可用”处理，本次不挡；每晚任务会重查。`,
        ],
      };
    } else {
      result = {
        failures: [`${parseError}，不能当作“没有漏洞”。`],
        waived: [],
        moderate: [],
        warnings: [],
      };
    }
  } else {
    result = evaluate(audit, readFileSync(allowlistPath, "utf8"), {
      scope: args.scope,
      includeDev: args.includeDev,
      today,
    });
  }

  const report = renderReport(result);
  if (args.report !== "") writeFileSync(args.report, report);
  if (result.failures.length === 0) {
    console.log(`审计闸门通过（范围 ${args.scope}，${args.includeDev ? "含" : "不含"}开发依赖）。`);
    for (const line of result.waived) console.log(`  已放行  ${line}`);
    for (const line of result.warnings) console.log(`  提示    ${line}`);
    for (const line of result.moderate) console.log(`  moderate  ${line}`);
    return 0;
  }
  console.error("审计闸门失败：");
  for (const line of result.failures) console.error(`  - ${line}`);
  for (const line of result.waived) console.error(`  已放行  ${line}`);
  return 1;
}

if (import.meta.main) process.exit(main());
