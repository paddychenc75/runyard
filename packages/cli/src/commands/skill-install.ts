import { absPath, joinPath, posixRelPath } from "@runyard/platform";
import { usageError } from "../cli-error.ts";
import { skillText } from "../skill/skill-text.ts";
import type { CommandHandler } from "./command-spec.ts";

// skill install：把给智能体的说明写到约定位置（规格 CLI-COMMANDS-73 到 77）。
// 只写这两个固定位置，不连管理进程；位置在主目录下，所以测试用假平台的主目录就不会碰真实目录。

const TARGETS = {
  claude: ".claude/skills/runyard",
  agents: ".agents/skills/runyard",
} as const;
type Target = keyof typeof TARGETS;

function targetsOf(value: string | undefined): Target[] {
  if (value === undefined || value === "all") return ["claude", "agents"];
  if (value === "claude" || value === "agents") return [value];
  throw usageError((t) => t("cli.usage.invalidValue.body", { option: "target", value }));
}

export const skillInstall: CommandHandler = async (context) => {
  // 先校验再写：值不对时不写任何文件
  const targets = targetsOf(context.value("target"));
  const installed: { target: Target; path: string }[] = [];
  for (const target of targets) {
    const dir = joinPath(context.platform.paths.home, posixRelPath(TARGETS[target]));
    await context.platform.fs.makeDir(dir);
    const file = joinPath(dir, posixRelPath("SKILL.md"));
    await context.platform.fs.writeAtomic(absPath(file), skillText("zh-CN", context.platform.id));
    await context.platform.fs.writeAtomic(
      joinPath(dir, posixRelPath("SKILL.zh-CN.md")),
      skillText("zh-CN", context.platform.id),
    );
    await context.platform.fs.writeAtomic(
      joinPath(dir, posixRelPath("SKILL.en.md")),
      skillText("en", context.platform.id),
    );
    installed.push({ target, path: file });
  }
  context.out.result(
    { installed },
    installed.map((item) => context.t("cli.skillInstall.installed.body", item)),
  );
};
