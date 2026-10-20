import type { AbsPath, Platform } from "@runyard/platform";
import type { ToolDefinition } from "@runyard/protocol";
import { libraryError } from "../library/library-error.ts";
import type { RunClock } from "../run/run-clock.ts";
import { detectTool } from "../toolchain/detect-tool.ts";

/** 从平台已有候选中找指定版本；不安装工具，不更改用户当前默认版本。 */
export async function requestedToolPaths(
  platform: Platform,
  clock: RunClock,
  definitions: ReadonlyMap<string, ToolDefinition>,
  cwd: AbsPath,
  requested: Readonly<Record<string, string>>,
  configured: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const paths = { ...configured };
  const loaded = await platform.env.load({ cwd });
  for (const [tool, version] of Object.entries(requested)) {
    const definition = definitions.get(tool);
    let found: string | undefined;
    if (definition) {
      const candidates = new Set<string>(configured[tool] ? [configured[tool]] : []);
      const names = definition.executables ?? [tool];
      const executables =
        tool === "python" ? [...names, `python${version.split(".").slice(0, 2).join(".")}`] : names;
      for (const executable of executables)
        for (const candidate of await platform.tools.candidates(executable, loaded.env))
          candidates.add(candidate.path);
      for (const candidate of candidates) {
        if (signal?.aborted) throw new Error("template test cancelled");
        const result = await detectTool({ platform, clock }, definition, {
          cwd,
          env: { ...loaded.env, ...platform.env.runDefaults() },
          useKnownLocations: true,
          manualPath: candidate,
        });
        if (result.state === "found" && result.path === candidate && result.version === version) {
          found = candidate;
          break;
        }
      }
    }
    if (!found)
      throw libraryError(
        "TOOL_MISSING",
        { tool, required: version },
        "requested tool version is unavailable",
      );
    paths[tool] = found;
  }
  return paths;
}
