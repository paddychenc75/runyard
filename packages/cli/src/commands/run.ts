import { detectCaller } from "../creator/detect-creator.ts";
import type { CommandHandler } from "./command-spec.ts";
import {
  announce,
  DEFAULT_TIMEOUT_SECONDS,
  parsePort,
  parsePositive,
  runLines,
  startAndReport,
} from "./start-run.ts";

// runyard run <pg>（规格 CLI-COMMANDS-38 到 46、78、79；PRD #prd-cli-json）。
// 重复启动、停止中再启动、端口被占用等规则都在管理进程里（run.start），这里只翻译参数和整理结果。

export const runPlayground: CommandHandler = async (context) => {
  const playground = context.positionals[0] ?? "";
  const timeoutSeconds = parsePositive(context, "timeout") ?? DEFAULT_TIMEOUT_SECONDS;
  const port = parsePort(context);
  const { owner } = detectCaller(context.env, `runyard run ${playground}`);
  const client = await context.client();

  // 先取一次项目：等什么（服务等就绪，脚本等退出）取决于种类；找不到在这里就报 PLAYGROUND_NOT_FOUND
  const found = await client.call("playground.get", { playground });
  context.out.progress(context.t("cli.run.starting.body", { name: found.name }));
  const started = await startAndReport(context, {
    playground: found.id,
    kind: found.kind,
    owner,
    timeoutSeconds,
    noWait: context.flag("no-wait"),
    restart: context.flag("restart"),
    port,
  });
  announce(context, started);
  context.out.result(started.json, runLines(context, started));
};
