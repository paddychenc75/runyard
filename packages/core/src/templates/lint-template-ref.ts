import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { isRecord, type LintResult } from "@runyard/protocol";
import { lintTemplate } from "./lint-template.ts";
import { locateTemplate, type TemplateLocations } from "./locate-template.ts";
import { readTemplateFolder } from "./read-template-folder.ts";
import { readToolDefinitions } from "./read-tool-definitions.ts";

// `template lint <模板标识或文件夹>` 的定位和读取（规格 cli/commands“模板命令”、templates/format“template lint 的判定”、
// templates/custom）。判定本身是 lintTemplate；这里负责找到文件夹、读运行器和工具定义，
// 并补上只有“放在模板目录里”才有的规则：文件夹名与 id 一致、用户模板不许占用内置标识。

export type LintRefOutcome =
  | { readonly kind: "not-found" }
  | { readonly kind: "linted"; readonly result: LintResult };

async function readRunners(platform: Platform, runnersDir: AbsPath): Promise<Map<string, unknown>> {
  const runners = new Map<string, unknown>();
  for (const id of await platform.fs.listDirs(runnersDir)) {
    const text = await platform.fs.readText(
      joinPath(runnersDir, posixRelPath(`${id}/runner.json`)),
    );
    if (text === null) continue;
    try {
      runners.set(id, JSON.parse(text));
    } catch {
      runners.set(id, null);
    }
  }
  return runners;
}

function declaredId(templateJson: string): string | undefined {
  try {
    const raw: unknown = JSON.parse(templateJson);
    return isRecord(raw) && typeof raw.id === "string" ? raw.id : undefined;
  } catch {
    return undefined;
  }
}

export async function lintTemplateRef(
  platform: Platform,
  locations: TemplateLocations,
  ref: string,
): Promise<LintRefOutcome> {
  const target = await locateTemplate(platform, locations, ref);
  if (target === null) return { kind: "not-found" };
  const folder = await readTemplateFolder(platform, target.dir);
  if (folder === null) return { kind: "not-found" };
  const result = lintTemplate({
    folder,
    builtin: target.builtin,
    // 只用应用内置的运行器：模板文件夹里自带的 runner.json 不会被读（规格 TEMPLATES-CUSTOM-20）
    runners: await readRunners(platform, locations.runnersDir),
    knownTools: new Set((await readToolDefinitions(platform, locations.toolsDir)).keys()),
    fallbackName: target.name,
  });
  const extra = [];
  const id = declaredId(folder.templateJson);
  if (target.inTemplateDir && id !== undefined && id !== target.name) {
    extra.push({
      rule: "template-json-invalid" as const,
      path: "id",
      message: `id "${id}" does not match the folder name "${target.name}"`,
    });
  }
  if (target.user) {
    const builtinTaken =
      (await platform.fs.readText(
        joinPath(locations.builtinDir, posixRelPath(`${target.name}/template.json`)),
      )) !== null;
    if (builtinTaken) {
      extra.push({
        rule: "template-id-reserved" as const,
        path: "id",
        message: `id "${target.name}" is used by a built-in template`,
      });
    }
  }
  if (extra.length === 0) return { kind: "linted", result };
  const errors = [...result.errors, ...extra];
  return { kind: "linted", result: { ...result, ok: false, errors } };
}
