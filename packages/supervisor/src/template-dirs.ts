import { fileURLToPath } from "node:url";
import { absPath } from "@runyard/platform";
import type { TemplateDataDirs } from "./supervisor-options.ts";

/** 模板数据的三个目录都在同一个根下：仓库的 templates/，或应用资源目录里的 runyard/templates/ */
export function templateDirsUnder(root: URL): TemplateDataDirs {
  const at = (name: string) => absPath(fileURLToPath(new URL(`${name}/`, root)).replace(/\/$/, ""));
  return { builtinDir: at("builtin"), runnersDir: at("runners"), toolsDir: at("tools") };
}
