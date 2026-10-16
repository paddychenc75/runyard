import type { RunyardClient } from "@runyard/client";
import { endStates } from "@runyard/core";
import type { RunState } from "@runyard/protocol";
import type { CommandContext } from "./command-context.ts";
import { cursorOrNull, logTextOf } from "./log-text.ts";

// logs --follow：持续输出新内容，直到这次运行进入结束状态（规格 CLI-COMMANDS-59）。
// 订阅的事件只当“有新东西了”的信号，真正的内容每次都用 logs.read 按游标取：
// 这样游标始终准确，订阅登记前后的缝隙里不会丢行、也不会重复。

/** 信号可以先于等待到达，不会丢 */
class Wake {
  #pending = false;
  #resolve: (() => void) | undefined;

  signal(): void {
    this.#pending = true;
    this.#resolve?.();
    this.#resolve = undefined;
  }

  async wait(): Promise<void> {
    if (!this.#pending) await new Promise<void>((resolve) => (this.#resolve = resolve));
    this.#pending = false;
  }
}

function isEnded(state: RunState | undefined): boolean {
  // 项目从没运行过（没有状态）也没有可跟随的东西
  return state === undefined || endStates.includes(state);
}

export async function followLogs(
  context: CommandContext,
  client: RunyardClient,
  request: { playground: string; since?: string; raw?: boolean },
  tail: number | undefined,
): Promise<void> {
  const wake = new Wake();
  const raw = request.raw === true ? { raw: true } : {};
  const subscriptions = [
    await client.followLogs({ playground: request.playground, ...raw }, () => wake.signal()),
    await client.subscribe(["run"], () => wake.signal()),
  ];
  // 连接断了也唤醒，下一次读取会以 SUPERVISOR_UNAVAILABLE 失败，而不是一直等
  void client.closed.then(() => wake.signal());
  const textOf = logTextOf(context);
  try {
    let cursor = request.since;
    let first = true;
    for (;;) {
      const result = await client.call("logs.read", {
        playground: request.playground,
        ...raw,
        ...(cursor === undefined ? {} : { since: cursor }),
        ...(first && tail !== undefined ? { tail } : {}),
      });
      first = false;
      cursor = result.cursor;
      const text = textOf(result.entries);
      if (result.entries.length > 0) {
        context.out.data(text);
        context.out.stream({ text, cursor: cursorOrNull(cursor), state: result.state ?? null });
      }
      if (isEnded(result.state)) {
        context.out.stream({ end: true, cursor: cursorOrNull(cursor) });
        return;
      }
      await wake.wait();
    }
  } finally {
    await Promise.all(subscriptions.map((subscription) => subscription.unsubscribe()));
  }
}
