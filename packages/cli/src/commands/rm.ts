import { cliError } from "../cli-error.ts";
import type { CommandHandler } from "./command-spec.ts";

// rm <pg>（规格 CLI-COMMANDS“rm 先停止再移到废纸篓”；PRD #prd-retention）。
// 先停止、释放、移动都由管理进程的 playground.trash 完成，这里没有任何删除文件的路径。
// 先 get 一次是为了在结果里带名称和移动前的绝对路径。

export const rm: CommandHandler = async (context) => {
  const ref = context.positionals[0] ?? "";
  const client = await context.client();
  const playground = await client.call("playground.get", { playground: ref });
  const outcome = await client.call("playground.trash", { playground: ref });
  if (!outcome.trashed) throw cliError("TRASH_UNAVAILABLE", { name: playground.name });
  context.out.result({ name: playground.name, path: playground.path, trashed: true }, [
    context.t("cli.rm.trashed.body", { name: playground.name, path: playground.path }),
  ]);
};
