import {
  decodeText,
  lintTemplateRef,
  listFolderFiles,
  locateTemplate,
  type PlaygroundSeed,
  type SeedFile,
  type TemplateLocations,
} from "@runyard/core";
import { joinPath, type Platform, posixRelPath } from "@runyard/platform";
import {
  type Requires,
  type RunKind,
  readVersionedText,
  runKindSchema,
  type Template,
  templateFileFormat,
  templateIdPattern,
} from "@runyard/protocol";
import type { TemplateCatalog } from "./library-seams.ts";
import { methodFailure } from "./method-failure.ts";

// 模板展开成项目（seed）：找到模板、校验、检查变量、把 files/ 里的文件交给资源库
// （规格 TEMPLATES-FORMAT-02、03，TEMPLATES-CUSTOM-02、19、22，CLI-COMMANDS-29、30）。
// 创建不联网：只读磁盘；变量只是对 `substitute` 所列文件里 {{名字}} 的字面替换。

export interface TemplateCatalogDeps {
  readonly platform: Platform;
  readonly locations: TemplateLocations;
  /** 写进 playground.json 的 template.appVersion */
  readonly appVersion: string;
  /** 创建时各工具的实际版本；检测不到的不写，也不让创建失败（缺工具是启动时才报的事） */
  readonly detectVersions?: (requires: Requires) => Promise<Record<string, string>>;
}

const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/** 字面替换：值里的 $&、$1 等原样保留，所以用函数而不是替换串 */
function substitute(text: string, values: ReadonlyMap<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => values.get(key) ?? whole);
}

export function createTemplateCatalog(deps: TemplateCatalogDeps): TemplateCatalog {
  const { platform, locations } = deps;
  const kinds = new Map<string, RunKind>();

  async function loadKind(runner: string): Promise<RunKind | undefined> {
    if (!templateIdPattern.test(runner)) return undefined;
    const text = await platform.fs.readText(
      joinPath(locations.runnersDir, posixRelPath(`${runner}/runner.json`)),
    );
    if (text === null) return undefined;
    try {
      const kind = runKindSchema.safeParse((JSON.parse(text) as { kind?: unknown }).kind);
      return kind.success ? kind.data : undefined;
    } catch {
      return undefined;
    }
  }

  // runnerKind 是同步的接缝：启动时把运行器的种类读进缓存，seed 时再补一次
  const primed = (async () => {
    for (const runner of await platform.fs.listDirs(locations.runnersDir)) {
      const kind = await loadKind(runner);
      if (kind !== undefined) kinds.set(runner, kind);
    }
  })().catch(() => undefined);

  async function* filesOf(
    root: ReturnType<typeof joinPath>,
    template: Template,
    values: ReadonlyMap<string, string>,
  ): AsyncGenerator<SeedFile> {
    const listed = new Set(template.substitute ?? []);
    for (const path of await listFolderFiles(platform, root)) {
      const bytes = await platform.fs.readBytes(joinPath(root, path));
      if (bytes === null) continue;
      const text = listed.has(path) ? decodeText(bytes) : undefined;
      yield { path, contents: text === undefined ? bytes : substitute(text, values) };
    }
  }

  return {
    async seed({ template: ref, name, vars }): Promise<PlaygroundSeed> {
      // 只认标识：绝对路径不是创建的入参（lint 命令才收文件夹）
      const notFound = () => methodFailure("TEMPLATE_NOT_FOUND", { template: ref }, `no ${ref}`);
      if (!templateIdPattern.test(ref)) throw notFound();
      // 内置的标识优先于同名的用户模板（规格 TEMPLATES-CUSTOM-22）
      const target = await locateTemplate(platform, locations, ref);
      if (target === null) throw notFound();
      const linted = await lintTemplateRef(platform, locations, ref);
      if (linted.kind === "not-found") throw notFound();
      if (!linted.result.ok) {
        throw methodFailure("TEMPLATE_INVALID", { template: ref }, `${ref} does not pass lint`);
      }
      const text = await platform.fs.readText(joinPath(target.dir, posixRelPath("template.json")));
      const read = text === null ? undefined : readVersionedText(templateFileFormat, text);
      if (read?.status !== "ok") {
        throw methodFailure("TEMPLATE_INVALID", { template: ref }, `${ref} cannot be read`);
      }
      const template = read.value;

      // name 由项目名提供，不许用 --var 改；没声明的变量一律拒绝（规格 CLI-COMMANDS-30）
      const declared = template.variables ?? {};
      for (const key of Object.keys(vars)) {
        if (key === "name" || !(key in declared)) {
          throw methodFailure("VAR_INVALID", { key }, `variable ${key} is not declared`);
        }
      }
      const values = new Map<string, string>([
        ...Object.entries(declared),
        ...Object.entries(vars),
      ]);
      values.set("name", name);

      await primed;
      const kind = (await loadKind(template.runner)) ?? kinds.get(template.runner);
      if (kind !== undefined) kinds.set(template.runner, kind);

      const toolchainAtCreate = (await deps.detectVersions?.(template.requires)) ?? {};
      return {
        template: {
          id: template.id,
          source: target.builtin ? "builtin" : "user",
          appVersion: deps.appVersion,
        },
        runner: template.runner,
        requires: Object.fromEntries(
          Object.entries(template.requires).map(([tool, need]) => [tool, need.version]),
        ),
        toolchainAtCreate,
        entry: template.entry,
        files: filesOf(joinPath(target.dir, posixRelPath("files")), template, values),
      };
    },
    runnerKind: (runner) => kinds.get(runner),
  };
}
