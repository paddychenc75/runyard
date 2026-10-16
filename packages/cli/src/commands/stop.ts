import { isClientError } from "@runyard/client";
import type { RunSnapshot } from "@runyard/protocol";
import { usageError } from "../cli-error.ts";
import type { CommandHandler } from "./command-spec.ts";

// stop <pg> | stop --all [--mine]（规格 CLI-COMMANDS“stop 停止运行”；PRD #prd-stop）。
// 参数组合先校验再连管理进程：不合法的组合不会停掉任何东西。
// 管理进程的 run.stop 对已经结束的运行也会返回快照，所以用停之前的“活动中”清单判断这次到底停了谁。

export const stop: CommandHandler = async (context) => {
  const ref = context.positionals[0];
  const all = context.flag("all");
  const mine = context.flag("mine");
  const valid = ref === undefined ? all : !all && !mine;
  if (!valid) throw usageError((t) => t("cli.usage.stopTarget.body"));

  const client = await context.client();
  const active = new Map<string, RunSnapshot>();
  for (const run of await client.call("run.list", { running: true })) active.set(run.runId, run);

  let runIds: string[];
  if (ref === undefined) {
    const result = await client.call("run.stopAll", mine ? { mine: true } : {});
    runIds = result.stopped;
  } else {
    try {
      const snapshot = await client.call("run.stop", { playground: ref });
      runIds = active.has(snapshot.runId) ? [snapshot.runId] : [];
    } catch (error) {
      // 项目存在但从没运行过：没有东西可停，不是错误
      if (!(isClientError(error) && error.code === "RUN_NOT_FOUND")) throw error;
      runIds = [];
    }
  }

  const stopped = runIds.flatMap((runId) => {
    const run = active.get(runId);
    return run === undefined ? [] : [{ runId, name: run.name }];
  });
  context.out.result(
    { stopped },
    stopped.length === 0
      ? [context.t("cli.stop.none.body")]
      : stopped.map((item) =>
          context.t("cli.stop.stopped.body", { name: item.name, runId: item.runId }),
        ),
  );
};
