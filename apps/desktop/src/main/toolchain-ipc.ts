import type { SettingsMethod } from "../shared/settings-bridge.ts";
import type { ToolchainSettings } from "./toolchain-settings.ts";

type Method = Extract<SettingsMethod, `toolchain.${string}`> | "settings.localNetwork";
const toolName = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** 运行环境的窄桥：界面只提交工具标识及路径，验证和保存仍由现有控制器处理。 */
export function toolchainMethods(
  toolchain: ToolchainSettings | undefined,
): Record<Method, (value: unknown) => unknown> {
  return {
    "settings.localNetwork": async () => (await toolchain?.localNetwork()) ?? {},
    "toolchain.check": async (value) => {
      const cachedOnly =
        typeof value === "object" &&
        value !== null &&
        (value as { cachedOnly?: unknown }).cachedOnly === true;
      return (await toolchain?.check(cachedOnly)) ?? { tools: [] };
    },
    "toolchain.recheck": async () => (await toolchain?.recheck()) ?? { tools: [] },
    "toolchain.pickPath": async (value) => {
      const tool = toolName(value);
      if (tool === null) return { status: "failed" };
      return (await toolchain?.pickPath(tool)) ?? { status: "failed" };
    },
    "toolchain.setPath": async (value) => {
      if (typeof value !== "object" || value === null) return { status: "failed" };
      const { tool, path } = value as Record<string, unknown>;
      const id = toolName(tool);
      if (id === null || typeof path !== "string") return { status: "failed" };
      return (await toolchain?.setPath(id, path)) ?? { status: "failed" };
    },
    "toolchain.runInstall": (value) => {
      const tool = toolName(value);
      if (tool !== null) toolchain?.runInstall(tool);
    },
  };
}
