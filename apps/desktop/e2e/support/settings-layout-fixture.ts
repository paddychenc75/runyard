import type { RunyardApp } from "./launch.ts";

export const LONG_TOOL_PATH =
  "/Users/demo/Library/Application Support/development-toolchains/node/versions/v24.21.0/installation with spaces/bin/node";

/** 仅供布局边界验证；不把固定报告当真实检测或技能安装的证据。 */
export async function installSettingsLayoutFixture(instance: RunyardApp) {
  await instance.app.evaluate(({ ipcMain }, path) => {
    const handlers = (
      ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
    )._invokeHandlers;
    const original = handlers.get("desktop:call");
    if (!original) throw new Error("桌面桥没有安装");
    ipcMain.removeHandler("desktop:call");
    ipcMain.handle("desktop:call", (event, method, ...args) => {
      if (method === "agents.status") return { claude: true, agents: true };
      if (method === "cli.status")
        return {
          state: "installed",
          version: "1.0.0-preview.20261020",
          path: "~/.local/bin/runyard",
          onPath: true,
          pathCommand: "",
        };
      if (method === "toolchain.check")
        return {
          tools: [
            { tool: "node", status: "found", version: "24.21.0", path, arch: "arm64" },
            {
              tool: "python",
              status: "too-old",
              version: "3.9.6",
              path: "/usr/bin/python3",
              arch: "universal",
              required: ">=3.10 <4",
            },
          ],
        };
      return original(event, method, ...args);
    });
  }, LONG_TOOL_PATH);
}
