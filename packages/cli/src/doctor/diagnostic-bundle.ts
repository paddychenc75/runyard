import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { scrubSupervisorFile, scrubText } from "./scrub-secrets.ts";
import type { ZipEntry } from "./zip-writer.ts";

// doctor --bundle：把诊断信息打成一个 zip（规格 CLI-COMMANDS“doctor 诊断和导出诊断包”；技术设计 §5.3）。
// 只收规格列出的这些：doctor --json 的结果、supervisor.json（去掉口令）、toolchain.json、最近 3 次运行日志、
// app.log、supervisor.log、系统版本和芯片架构。设置文件、环境变量、项目文件一概不收。

const RUN_LOG_COUNT = 3;
const PROGRAM_LOGS = ["app.log", "supervisor.log"];

export interface BundleInput {
  readonly platform: Platform;
  /** 不含 --bundle 的 doctor 结果，原样写成 doctor.json */
  readonly report: Readonly<Record<string, unknown>>;
  readonly system: { readonly os: string; readonly version: string; readonly arch: string };
}

const isProgramLog = (name: string): boolean =>
  PROGRAM_LOGS.some((log) => name === log || name.startsWith(`${log}.`));

/**
 * 每次运行一个日志文件，直接放在 logs/ 下（storage.md 2.5）；运行编号是按时间递增的，
 * 文件名从小到大就是从旧到新，所以取名字最大的三个。运行日志的文件名是 `<runId>.<playgroundId>.jsonl`（管理进程的日志模块，#43），
 * 这里只假定“不是 app.log / supervisor.log（含轮转）的文件就是运行日志”
 */
async function latestRunLogs(platform: Platform, logDir: AbsPath): Promise<string[]> {
  const names = (await platform.fs.listFiles(logDir)).filter((name) => !isProgramLog(name));
  return names.slice(-RUN_LOG_COUNT);
}

export async function collectBundle(input: BundleInput): Promise<{
  readonly entries: ZipEntry[];
  readonly files: string[];
}> {
  const { platform } = input;
  const state = platform.paths.stateDir;
  const read = (path: string) => platform.fs.readText(joinPath(state, posixRelPath(path)));

  const secrets: string[] = [];
  const texts = new Map<string, string>();

  const supervisor = await read("run/supervisor.json");
  if (supervisor !== null) {
    const scrubbed = scrubSupervisorFile(supervisor);
    if (scrubbed.token !== undefined) secrets.push(scrubbed.token);
    texts.set("supervisor.json", scrubbed.text);
  }
  for (const [name, path] of [
    ["toolchain.json", "state/toolchain.json"],
    ["app.log", "logs/app.log"],
    ["supervisor.log", "logs/supervisor.log"],
  ] as const) {
    const text = await read(path);
    if (text !== null) texts.set(name, text);
  }
  const logDir = joinPath(state, posixRelPath("logs"));
  for (const name of await latestRunLogs(platform, logDir)) {
    const text = await platform.fs.readText(joinPath(logDir, posixRelPath(name)));
    if (text !== null) texts.set(`runs/${name}`, text);
  }
  texts.set("doctor.json", `${JSON.stringify(input.report, null, 2)}\n`);
  texts.set("system.json", `${JSON.stringify(input.system, null, 2)}\n`);

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [...texts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, text]) => ({
      name,
      // 口令只该在 supervisor.json 里（已去掉）；别的文件里若漏进了它也一并抹掉
      data: encoder.encode(scrubText(text, secrets)),
    }));
  return { entries, files: entries.map((entry) => entry.name) };
}
