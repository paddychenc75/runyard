import type { TemplateLocations } from "@runyard/core";
import { joinPath, type Platform, posixRelPath } from "@runyard/platform";
import type { CliHost } from "../cli-deps.ts";

// 用户模板在状态目录下的 templates/（storage.md 第 1 节）；内置的数据位置由组合根给
export function templateLocations(platform: Platform, host: CliHost): TemplateLocations {
  return {
    ...host.templates,
    userDir: joinPath(platform.paths.stateDir, posixRelPath("templates")),
  };
}
