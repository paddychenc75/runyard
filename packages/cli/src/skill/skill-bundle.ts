import { absPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { usageError } from "../cli-error.ts";
import { skillText } from "./skill-text.ts";

// 技能包写到哪些位置、每个位置里有哪几份文件：安装、状态、卸载共用这一份，
// 随包说明的形式（哪份是执行用的、有没有对照）变了只改这里。

export const SKILL_TARGETS = {
  claude: ".claude/skills/runyard",
  agents: ".agents/skills/runyard",
} as const;
export type SkillTarget = keyof typeof SKILL_TARGETS;

export function skillTargetsOf(value: string | undefined): SkillTarget[] {
  if (value === undefined || value === "all") return ["claude", "agents"];
  if (value === "claude" || value === "agents") return [value];
  throw usageError((t) => t("cli.usage.invalidValue.body", { option: "target", value }));
}

/** 一个目标里 runyard 自己写的文件；第一份是执行用的说明 */
export function skillBundle(platform: Platform): { name: string; content: string }[] {
  return [
    { name: "SKILL.md", content: skillText("zh-CN", platform.id) },
    { name: "SKILL.zh-CN.md", content: skillText("zh-CN", platform.id) },
    { name: "SKILL.en.md", content: skillText("en", platform.id) },
  ];
}

export function skillDir(platform: Platform, target: SkillTarget) {
  return absPath(joinPath(platform.paths.home, posixRelPath(SKILL_TARGETS[target])));
}

export type SkillState = "missing" | "current" | "outdated";

/**
 * 装的是不是随包的版本：没有 SKILL.md 是没装；随包的每份文件都在、内容逐字相同才是当前版本，
 * 否则是旧版（包括用户改过的）。不另写版本标记：比内容不会和实际文件不一致，旧版命令行装的也能比。
 */
export async function skillStateOf(platform: Platform, target: SkillTarget): Promise<SkillState> {
  const dir = skillDir(platform, target);
  const bundle = skillBundle(platform);
  const first = bundle[0];
  if (first === undefined || !(await platform.fs.exists(joinPath(dir, posixRelPath(first.name)))))
    return "missing";
  for (const file of bundle) {
    const text = await platform.fs.readText(absPath(joinPath(dir, posixRelPath(file.name))));
    if (text !== file.content) return "outdated";
  }
  return "current";
}
