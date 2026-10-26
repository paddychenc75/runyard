import { skillBundle, skillDir, skillStateOf, skillTargetsOf } from "../skill/skill-bundle.ts";
import type { CommandHandler } from "./command-spec.ts";

// skill uninstall：把 runyard 装的技能目录移到废纸篓（规格 CLI-COMMANDS-95 到 97）。
// 只动固定位置里的 runyard 目录；里面只有 runyard 自己写的文件才整个移走，
// 有别人放的文件（或子目录）就原样保留，写进 skipped，不去挑着删。永不永久删除。
export const skillUninstall: CommandHandler = async (context) => {
  const { fs } = context.platform;
  const targets = skillTargetsOf(context.value("target"));
  const removed: { target: string; dir: string }[] = [];
  const skipped: { target: string; dir: string; reason: string }[] = [];
  const mine = new Set(skillBundle(context.platform).map((file) => file.name));
  for (const target of targets) {
    const dir = skillDir(context.platform, target);
    if ((await skillStateOf(context.platform, target)) === "missing") continue;
    const files = await fs.listFiles(dir);
    const dirs = await fs.listDirs(dir);
    if (dirs.length > 0 || files.some((name) => !mine.has(name))) {
      skipped.push({ target, dir, reason: "foreign-files" });
      continue;
    }
    await fs.trash(dir);
    removed.push({ target, dir });
  }
  context.out.result({ removed, skipped }, [
    ...removed.map((item) => context.t("cli.skillUninstall.removed.body", item)),
    ...skipped.map((item) => context.t("cli.skillUninstall.skipped.body", item)),
  ]);
};
