import type { RunyardClient } from "@runyard/client";
import { usageError } from "../cli-error.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";
import { cursorOrNull, logTextOf } from "./log-text.ts";
import { followLogs } from "./logs-follow.ts";

// logs <pg> [--since 游标] [--tail n] [--follow] [--raw]（规格 CLI-COMMANDS“logs 读取日志”、RUN-LOGS-18）。
// 默认只要最后 200 行；给了 --since 就读游标之后的全部，不再截断（截断会让调用方悄悄丢行）。

export const DEFAULT_TAIL = 200;

function parseTail(context: CommandContext): number | undefined {
  const value = context.value("tail");
  if (value === undefined) return undefined;
  const tail = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(tail) || tail < 1) {
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: "--tail", value }));
  }
  return tail;
}

export const logs: CommandHandler = async (context) => {
  const playground = context.positionals[0] ?? "";
  const since = context.value("since");
  const raw = context.flag("raw");
  const tail = parseTail(context) ?? (since === undefined ? DEFAULT_TAIL : undefined);
  const client = await context.client();
  const request = { playground, ...(raw ? { raw: true } : {}) };
  if (context.flag("follow")) {
    await followLogs(
      context,
      client,
      { ...request, ...(since === undefined ? {} : { since }) },
      tail,
    );
    return;
  }
  await readOnce(context, client, request, since, tail);
};

async function readOnce(
  context: CommandContext,
  client: RunyardClient,
  request: { playground: string; raw?: boolean },
  since: string | undefined,
  tail: number | undefined,
): Promise<void> {
  // 多要一行：多出来的那一行只用来知道“前面还有没给的内容”，不会输出
  const result = await client.call("logs.read", {
    ...request,
    ...(since === undefined ? {} : { since }),
    ...(tail === undefined ? {} : { tail: tail + 1 }),
  });
  const cut = tail !== undefined && result.entries.length > tail;
  const entries = cut ? result.entries.slice(-tail) : result.entries;
  const text = logTextOf(context)(entries);
  context.out.data(text);
  context.out.result({
    text,
    lines: entries.length,
    cursor: cursorOrNull(result.cursor),
    state: result.state ?? null,
    truncated: result.truncated || cut,
  });
}
