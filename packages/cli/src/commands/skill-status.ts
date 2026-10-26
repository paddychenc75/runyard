import { skillDir, skillStateOf, skillTargetsOf } from "../skill/skill-bundle.ts";
import type { CommandHandler } from "./command-spec.ts";

// skill status：每个位置里的说明是没装、当前版本还是旧版（规格 CLI-COMMANDS-93、94）。只读，不连管理进程。
export const skillStatus: CommandHandler = async (context) => {
  const targets: { target: string; dir: string; state: string }[] = [];
  for (const target of skillTargetsOf(context.value("target")))
    targets.push({
      target,
      dir: skillDir(context.platform, target),
      state: await skillStateOf(context.platform, target),
    });
  context.out.result(
    { targets },
    targets.map((item) => context.t("cli.skillStatus.item.body", item)),
  );
};
