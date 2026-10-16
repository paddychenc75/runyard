import {
  locateTemplate,
  readToolDefinitions,
  type TemplateLocations,
  ToolchainService,
} from "@runyard/core";
import { joinPath, posixRelPath } from "@runyard/platform";
import { type Requires, requiresSchema, type ToolCheck } from "@runyard/protocol";
import { cliError } from "../cli-error.ts";
import type { CommandContext } from "../commands/command-context.ts";
import { detectInstallContext, type InstallHint, installHints } from "./install-hints.ts";
import { readDoctorSettings } from "./read-settings.ts";

// doctor 的 tools 一项：在命令行进程里直接检测（不经管理进程），所以管理进程连不上时也有这一项
// （规格 CLI-COMMANDS-23）。结果不写缓存：onCacheChange 不接，state/toolchain.json 只由管理进程写。

export interface ToolEntry extends ToolCheck {
  /** 缺失或版本过低时的安装提示，只展示 */
  readonly install?: InstallHint[];
}

interface TemplateRequirements {
  readonly requires: Requires;
}

async function requirementsOf(
  context: CommandContext,
  locations: TemplateLocations,
  ref: string,
): Promise<TemplateRequirements> {
  const target = await locateTemplate(context.platform, locations, ref);
  if (target === null) throw cliError("TEMPLATE_NOT_FOUND", { template: ref });
  const text = await context.platform.fs.readText(
    joinPath(target.dir, posixRelPath("template.json")),
  );
  let raw: unknown;
  try {
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    raw = undefined;
  }
  const requires = requiresSchema.safeParse((raw as { requires?: unknown } | undefined)?.requires);
  if (!requires.success) throw cliError("TEMPLATE_INVALID", { template: ref });
  return { requires: requires.data };
}

export async function toolReport(
  context: CommandContext,
  locations: TemplateLocations,
  templateRef: string | undefined,
): Promise<ToolEntry[]> {
  const { platform, host } = context;
  const definitions = await readToolDefinitions(platform, locations.toolsDir);
  const settings = await readDoctorSettings(platform);
  const service = new ToolchainService({
    platform,
    clock: host.clock,
    definitions,
    toolPaths: () => settings.toolPaths,
    onChanged: () => undefined,
  });
  const wanted =
    templateRef === undefined ? undefined : await requirementsOf(context, locations, templateRef);
  const result =
    wanted === undefined
      ? await service.doctor()
      : await service.check({ requires: wanted.requires });

  const missing = result.tools.filter(
    (tool) => tool.status === "missing" || tool.status === "too-old",
  );
  if (missing.length === 0) return result.tools;
  const env = (await platform.env.load()).env;
  const installContext = await detectInstallContext(platform, definitions.values(), env);
  return result.tools.map((tool) => {
    if (tool.status !== "missing" && tool.status !== "too-old") return tool;
    const hints = installHints(
      definitions.get(tool.tool),
      wanted?.requires[tool.tool]?.install,
      installContext,
    );
    return hints.length === 0 ? tool : { ...tool, install: hints };
  });
}
