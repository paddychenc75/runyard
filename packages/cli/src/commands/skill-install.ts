import { absPath, joinPath, posixRelPath } from "@runyard/platform";
import { skillBundle, skillDir, skillTargetsOf } from "../skill/skill-bundle.ts";
import type { CommandHandler } from "./command-spec.ts";

// skill install：把给智能体的说明写到约定位置（规格 CLI-COMMANDS-73 到 77）。
// 只写这两个固定位置，不连管理进程；位置在主目录下，所以测试用假平台的主目录就不会碰真实目录。

export const skillInstall: CommandHandler = async (context) => {
  // 先校验再写：值不对时不写任何文件
  const targets = skillTargetsOf(context.value("target"));
  const installed: { target: string; path: string }[] = [];
  for (const target of targets) {
    const dir = skillDir(context.platform, target);
    await context.platform.fs.makeDir(dir);
    for (const file of skillBundle(context.platform))
      await context.platform.fs.writeAtomic(
        absPath(joinPath(dir, posixRelPath(file.name))),
        file.content,
      );
    installed.push({ target, path: joinPath(dir, posixRelPath("SKILL.md")) });
  }
  context.out.result(
    { installed },
    installed.map((item) => context.t("cli.skillInstall.installed.body", item)),
  );
};
