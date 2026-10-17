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
  readVersionedText,
  requiresSchema,
  runKindSchema,
  runnerFileFormat,
  type TemplateDetail,
  type TemplateRecord,
  type TemplateRunnerSummary,
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
  async function inspect(
    id: string,
    dir: AbsPath,
    source: TemplateRecord["source"],
  ): Promise<{ record: TemplateRecord; problems: TemplateDetail["problems"] } | undefined> {
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
    const record: TemplateRecord = {
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
    const errors = outcome.kind === "linted" ? outcome.result.errors : [];
    return { record, problems: errors.map(({ rule, path }) => ({ rule, path })) };
  }

  async function recordOf(
    id: string,
    dir: AbsPath,
    source: TemplateRecord["source"],
  ): Promise<TemplateRecord | undefined> {
    return (await inspect(id, dir, source))?.record;
  }

  // 运行方式的展示摘要：运行器不存在或读不出就是 null（模板页写“没有”，不是错误）
  async function runnerSummary(runner: string): Promise<TemplateRunnerSummary | null> {
    if (!templateIdPattern.test(runner)) return null;
    const text = await platform.fs.readText(
      joinPath(locations.runnersDir, posixRelPath(`${runner}/runner.json`)),
    );
    if (text === null) return null;
    const read = readVersionedText(runnerFileFormat, text);
    if (read.status !== "ok") return null;
    return {
      setup: Object.fromEntries(
        Object.entries(read.value.setup?.variants ?? {}).map(([tool, variant]) => [
          tool,
          variant.command,
        ]),
      ),
      run: read.value.run?.command ?? null,
      ready: read.value.ready ?? null,
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
      const inspected = await inspect(id, target.dir, target.builtin ? "builtin" : "user");
      if (inspected === undefined) return undefined;
      const files = await listFolderFiles(platform, joinPath(target.dir, posixRelPath("files")));
      return {
        template: inspected.record,
        path: target.dir,
        files,
        runner: await runnerSummary(inspected.record.runner),
        problems: inspected.problems,
      };
    },
    async builtinIds() {
      const ids = new Set<string>();
      for (const folder of await platform.fs.listDirs(locations.builtinDir)) ids.add(folder);
      return ids;
    },
  };
}
