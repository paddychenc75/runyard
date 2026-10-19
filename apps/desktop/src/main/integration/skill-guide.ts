import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DesktopRuntime } from "../composition-root.ts";

/** 只允许随包两份说明；界面不能传文件路径。 */
export function skillGuidePath(runtime: DesktopRuntime, locale: "en" | "zh-CN"): string {
  const name = locale === "zh-CN" ? "SKILL.zh-CN.md" : "SKILL.md";
  return runtime.kind === "packaged"
    ? join(runtime.resourcesPath, "runyard", "skill-guide", name)
    : fileURLToPath(new URL(`../skill-guide/${name}`, runtime.moduleUrl));
}
