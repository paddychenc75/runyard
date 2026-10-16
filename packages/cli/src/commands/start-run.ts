import { isClientError } from "@runyard/client";
import type { Localized } from "@runyard/i18n";
import type { Owner, RunKind, RunSnapshot } from "@runyard/protocol";
import { usageError } from "../cli-error.ts";
import type { JsonObject } from "../output/output.ts";
import type { CommandContext } from "./command-context.ts";

// 启动一个项目并把结果整理成 --json 的对象（规格 CLI-COMMANDS-24、25、38 到 46、79）。
// `new --run` 和 `run` 共用：等什么、等多久、结果里有哪些键都在这里。

/** `--timeout` 缺省的秒数（`run` 规格写明 60；`new` 没单列，沿用，见 cli-contract“未定”第 4 项） */
export const DEFAULT_TIMEOUT_SECONDS = 60;
/** 结果里带多少行日志：与 `logs` 的默认行数一致 */
export const RESULT_LOG_LINES = 200;

export function parsePositive(
  context: CommandContext,
  option: string,
  max?: number,
): number | undefined {
  const value = context.value(option);
  if (value === undefined) return undefined;
  const number = Number(value);
  const valid =
    /^[0-9]+(\.[0-9]+)?$/.test(value) && number > 0 && (max === undefined || number <= max);
  if (!valid)
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: `--${option}`, value }));
  return number;
}

/** `--port`：整数，端口范围内 */
export function parsePort(context: CommandContext): number | undefined {
  const port = parsePositive(context, "port", 65535);
  if (port !== undefined && !Number.isInteger(port)) {
    const value = context.value("port") ?? "";
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: "--port", value }));
  }
  return port;
}

export interface StartArgs {
  /** 项目的 id 或名称 */
  readonly playground: string;
  readonly kind: RunKind;
  readonly owner: Owner;
  readonly timeoutSeconds: number;
  readonly noWait: boolean;
  readonly restart: boolean;
  readonly port: number | undefined;
}

async function logsOf(
  context: CommandContext,
  snapshot: RunSnapshot,
): Promise<{ text: string; truncated: boolean; cursor: string }> {
  const client = await context.client();
  const read = await client.call("logs.read", {
    playground: snapshot.playgroundId,
    tail: RESULT_LOG_LINES,
  });
  // 管理进程默认返回清洗过的整行（不带换行），系统提示不是进程的输出
  const lines = read.entries.flatMap((entry) => (entry.kind === "system" ? [] : [entry.text]));
  return {
    text: lines.map((line) => `${line}\n`).join(""),
    truncated: read.truncated,
    cursor: read.cursor,
  };
}

/** 启动（或重启）并按种类等待，返回 `run` 的结果对象；文字模式下顺手把日志和提示写出去 */
export async function startAndReport(
  context: CommandContext,
  args: StartArgs,
): Promise<{ json: JsonObject; snapshot: RunSnapshot; output: string }> {
  const client = await context.client();
  if (args.restart) {
    // 重启 = 先停再启动：停止在返回时进程树已空；没有运行可停不算错
    await client.call("run.stop", { playground: args.playground }).catch((error: unknown) => {
      if (!(isClientError(error) && error.code === "RUN_NOT_FOUND")) throw error;
    });
  }
  const snapshot = await client.call("run.start", {
    playground: args.playground,
    owner: args.owner,
    wait: args.noWait ? "none" : args.kind === "oneshot" ? "exit" : "ready",
    timeoutMs: Math.round(args.timeoutSeconds * 1000),
    ...(args.port === undefined ? {} : { port: args.port }),
  });
  const logs = await logsOf(context, snapshot);
  const common = {
    runId: snapshot.runId,
    name: snapshot.name,
    state: snapshot.state,
    kind: snapshot.kind,
    alreadyRunning: snapshot.alreadyRunning ?? false,
    cursor: logs.cursor,
  };
  if (snapshot.kind === "oneshot") {
    return {
      output: logs.text,
      snapshot,
      json: {
        ...common,
        ...(snapshot.exitCode === undefined ? {} : { exitCode: snapshot.exitCode }),
        ...(snapshot.durationMs === undefined ? {} : { durationMs: snapshot.durationMs }),
        stale: snapshot.stale ?? false,
        output: logs.text,
        truncated: logs.truncated,
      },
    };
  }
  const settings = await client.call("settings.get", {});
  return {
    output: "",
    snapshot,
    json: {
      ...common,
      ...(snapshot.url === undefined ? {} : { url: snapshot.url }),
      ...(snapshot.port === undefined ? {} : { port: snapshot.port }),
      ...(snapshot.readyMs === undefined ? {} : { readyMs: snapshot.readyMs }),
      ...(snapshot.portFallback === undefined ? {} : { portFallback: snapshot.portFallback }),
      owner: snapshot.owner.kind,
      idleStopMinutes: settings.cliIdleStopMinutes,
      logTail: logs.text,
    },
  };
}

export type StartedRun = Awaited<ReturnType<typeof startAndReport>>;

/** 文字模式下的提示和脚本输出；脚本的输出是用户的数据，原样写出（--json 下什么也不写，输出在结果里） */
export function announce(context: CommandContext, started: StartedRun): void {
  const { portFallback } = started.snapshot;
  if (portFallback !== undefined && !context.out.json) {
    context.out.notice({
      code: "PORT_FALLBACK",
      params: {
        wanted: portFallback.wanted,
        actual: started.snapshot.port ?? portFallback.wanted,
        reason: portFallback.reason,
      },
    });
  }
  context.out.data(started.output);
}

/** 给人看的结果行：重复启动、就绪地址、脚本的退出码，其余说一声已启动 */
export function runLines(context: CommandContext, started: StartedRun): Localized[] {
  const { snapshot } = started;
  const { name, runId, url, exitCode } = snapshot;
  const lines: Localized[] = [];
  if (snapshot.alreadyRunning === true)
    lines.push(context.t("cli.run.alreadyRunning.body", { name }));
  if (snapshot.state === "ready" && url !== undefined) {
    lines.push(context.t("cli.run.ready.body", { name, url }));
  } else if (snapshot.state === "finished" && exitCode !== undefined) {
    lines.push(context.t("cli.run.finished.body", { name, exitCode }));
  } else {
    lines.push(context.t("cli.run.started.body", { name, runId }));
  }
  return lines;
}
