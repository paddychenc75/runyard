import {
  isRecord,
  type LintIssue,
  mergeIssues,
  newerFormatIssue,
  structuralIssues,
  type Validation,
} from "./lint-issue.ts";
import { RUNNER_FORMAT_VERSION, type Runner, runnerSchema } from "./runner-file.ts";

// 校验一份 runner.json 的内容（规格 templates/format 的运行器、命令、停止与地址三条）。
// 每条规则各自在原始数据上检查，不依赖 zod 是否通过，所以一次能报全。纯函数。

// shell 的运算符：整个元素恰好是它，才说明有人把一行 shell 拆成了数组（规格 TEMPLATES-FORMAT-19）。
// 元素内部含 ; 之类但整体是一个参数（如 python -c 的代码）不算（TEMPLATES-FORMAT-20）
const shellOperators: ReadonlySet<string> = new Set(["&&", "||", ";", "|", "&", ">", ">>", "<"]);

const signalName = /^SIG[A-Z0-9]+$/;
// 监听地址只能是 127.0.0.1；可带 --host= 一类前缀、协议和端口
const forbiddenAddress =
  /^(?:--?[A-Za-z-]+=)?(?:https?:\/\/)?(?:0\.0\.0\.0|localhost)(?::\d+)?(?:\/.*)?$/;
const portFlags: ReadonlySet<string> = new Set(["--port", "-p"]);
const literalPort = /^\d+$/;

function issue(rule: LintIssue["rule"], path: string, message: string): LintIssue {
  return { rule, path, message };
}

// 运行器里所有命令的位置，路径是 zod 风格的点路径
function commandSites(raw: Record<string, unknown>): { path: string; value: unknown }[] {
  const sites: { path: string; value: unknown }[] = [];
  const variants = isRecord(raw.setup) && isRecord(raw.setup.variants) ? raw.setup.variants : {};
  for (const [manager, variant] of Object.entries(variants))
    if (isRecord(variant))
      sites.push({ path: `setup.variants.${manager}.command`, value: variant.command });
  if (isRecord(raw.check)) sites.push({ path: "check.command", value: raw.check.command });
  if (isRecord(raw.run)) sites.push({ path: "run.command", value: raw.run.command });
  return sites;
}

function elementIssues(value: readonly unknown[], path: string): LintIssue[] {
  const issues: LintIssue[] = [];
  value.forEach((element, index) => {
    if (typeof element !== "string") return;
    const at = `${path}.${index}`;
    if (shellOperators.has(element) || element.startsWith("~"))
      issues.push(
        issue(
          "command-shell-syntax",
          at,
          `"${element}" is shell syntax; commands run without a shell`,
        ),
      );
    if (forbiddenAddress.test(element))
      issues.push(
        issue("bind-address", at, `"${element}" is not allowed; servers bind 127.0.0.1 only`),
      );
    if (element === "--no-color")
      issues.push(issue("runner-invalid", at, "--no-color makes Vite and Next exit with an error"));
    const prev = index > 0 ? value[index - 1] : undefined;
    const afterFlag = typeof prev === "string" && portFlags.has(prev) && literalPort.test(element);
    if (afterFlag || /^(?:--port|-p)=\d+$/.test(element))
      issues.push(issue("port-hardcoded", at, `"${element}" is a fixed port; pass {port} instead`));
  });
  return issues;
}

function commandIssues(raw: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const { path, value } of commandSites(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) issues.push(...elementIssues(value, path));
    else
      issues.push(
        issue("runner-invalid", path, "a command must be an array of strings, not one line"),
      );
  }
  return issues;
}

function envIssues(raw: Record<string, unknown>): LintIssue[] {
  const env = isRecord(raw.run) && isRecord(raw.run.env) ? raw.run.env : {};
  return Object.entries(env)
    .filter(([, value]) => typeof value === "string" && forbiddenAddress.test(value))
    .map(([key, value]) =>
      issue("bind-address", `run.env.${key}`, `"${String(value)}" is not allowed; bind 127.0.0.1`),
    );
}

// stop 里任何位置出现信号名：键或值（规格 TEMPLATES-FORMAT-22）。整个 stop 由这条规则接管
function stopIssues(raw: Record<string, unknown>): LintIssue[] {
  if (!isRecord(raw.stop)) return [];
  const found = Object.entries(raw.stop).some(
    ([key, value]) => signalName.test(key) || (typeof value === "string" && signalName.test(value)),
  );
  return found
    ? [
        issue(
          "stop-signal-name",
          "stop",
          "stop takes a mode (graceful or interrupt) and graceMs, never a signal name",
        ),
      ]
    : [];
}

// 按类别的约束（规格 TEMPLATES-FORMAT-12 至 14）
function kindIssues(raw: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  const { kind } = raw;
  const mode = isRecord(raw.watch) ? raw.watch.mode : undefined;
  if (kind === "server" && raw.ready === undefined)
    issues.push(issue("runner-invalid", "ready", "a server runner needs ready"));
  if (kind === "oneshot" && raw.ready !== undefined)
    issues.push(issue("runner-invalid", "ready", "a oneshot runner must not have ready"));
  if (kind === "static" && raw.run !== undefined)
    issues.push(issue("runner-invalid", "run", "a static runner must not have a run command"));
  if ((kind === "server" || kind === "oneshot") && raw.run === undefined)
    issues.push(issue("runner-invalid", "run", `a ${kind} runner needs run`));
  if (mode === "rerun" && kind !== "oneshot")
    issues.push(issue("runner-invalid", "watch.mode", "rerun is only for oneshot runners"));
  if (mode === "restart" && kind !== "server")
    issues.push(issue("runner-invalid", "watch.mode", "restart is only for server runners"));
  return issues;
}

export function validateRunner(raw: unknown): Validation<Runner> {
  const newer = newerFormatIssue(raw, RUNNER_FORMAT_VERSION);
  if (newer !== undefined) return { errors: [newer], warnings: [] };
  const parsed = runnerSchema.safeParse(raw);
  const structural = parsed.success ? [] : structuralIssues(parsed.error, "runner-invalid");
  const specific = isRecord(raw)
    ? [...commandIssues(raw), ...envIssues(raw), ...stopIssues(raw), ...kindIssues(raw)]
    : [];
  const { errors, warnings } = mergeIssues(specific, structural);
  return parsed.success && errors.length === 0
    ? { value: parsed.data, errors, warnings }
    : { errors, warnings };
}
