import {
  lintTemplateRef,
  listFolderFiles,
  locateTemplate,
  type TemplateLocations,
} from "@runyard/core";
import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import {
  isRecord,
  localizedTextSchema,
  type RunKind,
  requiresSchema,
  runKindSchema,
  type TemplateDetail,
  type TemplateRecord,
  templateCategorySchema,
  templateIdPattern,
  templateTagSchema,
} from "@runyard/protocol";

// 模板的读：内置模板（应用自带）加用户模板（状态目录下的 templates/）。
// 内置的标识优先（负责人 2026-10-12 的决定，规格 TEMPLATES-CUSTOM-22）：同标识的用户模板照样在列表里，但 valid 为 false。
// 坏模板只让它自己 valid 为 false，不弄坏整张列表（字段读不出就取缺省值）。

export interface TemplateLibrary {
  readonly locations: TemplateLocations;
  list(): Promise<TemplateRecord[]>;
  get(id: string): Promise<TemplateDetail | undefined>;
  /** 内置模板的标识：另存为模板时不许占用 */
  builtinIds(): Promise<ReadonlySet<string>>;
}

function parseRecord(text: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function createTemplateLibrary(
  platform: Platform,
  locations: TemplateLocations,
): TemplateLibrary {
  async function runnerKind(runner: string): Promise<RunKind | null> {
    if (!templateIdPattern.test(runner)) return null;
    const text = await platform.fs.readText(
      joinPath(locations.runnersDir, posixRelPath(`${runner}/runner.json`)),
    );
    const kind = runKindSchema.safeParse(text === null ? undefined : parseRecord(text).kind);
    return kind.success ? kind.data : null;
  }

  // dir 用绝对路径定位：同标识的内置和用户模板才分得开
  async function recordOf(
    id: string,
    dir: AbsPath,
    source: TemplateRecord["source"],
  ): Promise<TemplateRecord | undefined> {
    const text = await platform.fs.readText(joinPath(dir, posixRelPath("template.json")));
    if (text === null) return undefined;
    const fields = parseRecord(text);
    const name = localizedTextSchema.safeParse(fields.name);
    const description = localizedTextSchema.safeParse(fields.description);
    const category = templateCategorySchema.safeParse(fields.category);
    const requires = requiresSchema.safeParse(fields.requires);
    const runner = typeof fields.runner === "string" ? fields.runner : "";
    const tags = Array.isArray(fields.tags)
      ? fields.tags.flatMap((tag) => {
          const parsed = templateTagSchema.safeParse(tag);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const outcome = await lintTemplateRef(platform, locations, source === "builtin" ? id : dir);
    return {
      id,
      name: name.success ? name.data : id,
      description: description.success ? description.data : "",
      category: category.success ? category.data : "mine",
      tags,
      source,
      runner,
      kind: await runnerKind(runner),
      requires: requires.success ? requires.data : {},
      valid: outcome.kind === "linted" && outcome.result.ok,
    };
  }

  async function recordsIn(
    root: AbsPath,
    source: TemplateRecord["source"],
  ): Promise<TemplateRecord[]> {
    const found: TemplateRecord[] = [];
    for (const folder of (await platform.fs.listDirs(root)).sort()) {
      // 另存时的临时目录（.saving-…）和别的点开头的文件夹不是模板
      if (folder.startsWith(".")) continue;
      const dir = joinPath(root, posixRelPath(folder));
      const record = await recordOf(folder, dir, source);
      if (record !== undefined) found.push(record);
    }
    return found;
  }

  return {
    locations,
    async list() {
      return [
        ...(await recordsIn(locations.builtinDir, "builtin")),
        ...(await recordsIn(locations.userDir, "user")),
      ];
    },
    async get(id) {
      // 只认标识：绝对路径不是 template.get 的入参，不能借它读任意文件夹
      if (!templateIdPattern.test(id)) return undefined;
      const target = await locateTemplate(platform, locations, id);
      if (target === null) return undefined;
      const template = await recordOf(id, target.dir, target.builtin ? "builtin" : "user");
      if (template === undefined) return undefined;
      const files = await listFolderFiles(platform, joinPath(target.dir, posixRelPath("files")));
      return { template, path: target.dir, files };
    },
    async builtinIds() {
      const ids = new Set<string>();
      for (const folder of await platform.fs.listDirs(locations.builtinDir)) ids.add(folder);
      return ids;
    },
  };
}
