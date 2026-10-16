import { dirname } from "node:path";
import {
  type AbsPath,
  absPath,
  joinPath,
  type Platform,
  type PosixRelPath,
  posixRelPath,
} from "@runyard/platform";
import { templateIdPattern } from "@runyard/protocol";
import { libraryError } from "../library/library-error.ts";
import { decodeText, listFolderFiles } from "./read-template-folder.ts";

// 把项目另存为用户模板（规格 templates/custom“把项目另存为模板”“另存时哪些文件进模板”“可选把项目名换成变量”）。
// 调用方（管理进程的 template.save 处理）负责找到项目、核对文件夹在不在（PLAYGROUND_NOT_FOUND、FOLDER_MISSING）；
// 这里只做文件的事。include / exclude 的路径由调用方用协议的 relativePathSchema 校验过（绝对路径和 .. 报 USAGE）。

export interface SaveTemplateInput {
  readonly projectDir: AbsPath;
  readonly projectName: string;
  /** 用户模板目录（状态目录下的 templates/） */
  readonly userDir: AbsPath;
  /** 内置模板的标识：占用了就不许另存（NAME_EXISTS） */
  readonly reservedIds: ReadonlySet<string>;
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  /** 沿用原项目 playground.json 记下的，不重新检测 */
  readonly runner: string;
  readonly requires: Readonly<Record<string, string>>;
  readonly entry?: string;
  readonly open?: readonly string[];
  readonly replaceName?: boolean;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  /** 临时目录名里的随机部分；测试可以固定它 */
  readonly nonce?: () => string;
}

export interface SavedTemplate {
  readonly id: string;
  readonly name: string;
  readonly path: AbsPath;
  readonly files: PosixRelPath[];
  readonly source: "user";
}

// 默认不进模板的东西。依赖目录、.git、__pycache__ 在任何深度都不进；构建产物只看项目根
// （src/build/ 这类源码目录不能被误伤）。.runyard/ 只在根，永远不进，include 也加不进来
const ANYWHERE_DIRS = new Set(["node_modules", ".venv", ".git", "__pycache__"]);
const ROOT_DIRS = new Set(["dist", "build", ".next", ".nuxt", ".output"]);
const ENV_FILE = /^\.env(\..+)?$/;

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function excludedByDefault(path: string, isDirectory: boolean): boolean {
  const base = lastSegment(path);
  if (isDirectory) return ANYWHERE_DIRS.has(base) || (!path.includes("/") && ROOT_DIRS.has(base));
  return ENV_FILE.test(base);
}

const covers = (list: readonly string[], path: string): boolean =>
  list.some((entry) => path === entry || path.startsWith(`${entry}/`));
const leadsTo = (list: readonly string[], path: string): boolean =>
  list.some((entry) => entry.startsWith(`${path}/`));

/** 哪些文件进模板：默认规则，加上 include 和 exclude（exclude 最后生效） */
async function selectFiles(platform: Platform, input: SaveTemplateInput): Promise<PosixRelPath[]> {
  const include = input.include ?? [];
  const exclude = input.exclude ?? [];
  const all = await listFolderFiles(platform, input.projectDir, (path, isDirectory) => {
    if (path === ".runyard") return true;
    if (!excludedByDefault(path, isDirectory)) return false;
    // 默认不进的目录：include 点名了它或它里面的东西才进去看
    return !(covers(include, path) || (isDirectory && leadsTo(include, path)));
  });
  return all.filter((path) => {
    if (covers(exclude, path)) return false;
    // 默认不进的文件（.env）与默认不进的目录下的文件，只有被 include 点名的才留下
    const parts = path.split("/");
    const inDefaultExcluded = parts.some((_, index) => {
      const prefix = parts.slice(0, index + 1).join("/");
      return excludedByDefault(prefix, index < parts.length - 1);
    });
    return !inDefaultExcluded || covers(include, path);
  });
}

function replaceProjectName(text: string, projectName: string): string {
  return projectName === "" ? text : text.split(projectName).join("{{name}}");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function saveTemplate(
  platform: Platform,
  input: SaveTemplateInput,
): Promise<SavedTemplate> {
  const { id } = input;
  if (!templateIdPattern.test(id)) {
    throw libraryError(
      "NAME_INVALID",
      { name: id, kind: "template" },
      `invalid template id: ${id}`,
    );
  }
  const finalDir = joinPath(input.userDir, posixRelPath(id));
  if (input.reservedIds.has(id) || (await platform.fs.exists(finalDir))) {
    throw libraryError(
      "NAME_EXISTS",
      { name: id, kind: "template" },
      `template id is taken: ${id}`,
    );
  }

  // 先把内容全读进内存，再动磁盘：能在写之前发现的问题都不留残片
  const selected = await selectFiles(platform, input);
  const contents = new Map<PosixRelPath, Uint8Array>();
  const substituted: string[] = [];
  for (const path of selected) {
    const bytes = await platform.fs.readBytes(joinPath(input.projectDir, path));
    if (bytes === null) continue;
    const text = input.replaceName === true ? decodeText(bytes) : undefined;
    if (text?.includes(input.projectName)) {
      contents.set(path, new TextEncoder().encode(replaceProjectName(text, input.projectName)));
      substituted.push(path);
    } else {
      contents.set(path, bytes);
    }
  }

  const files = [...contents.keys()];
  const entry = input.entry ?? input.open?.[0] ?? files[0] ?? "README.md";
  const name = input.name ?? id;
  const templateJson = {
    formatVersion: 1,
    id,
    name,
    description: input.description ?? "",
    category: "mine",
    runner: input.runner,
    requires: Object.fromEntries(
      Object.entries(input.requires).map(([tool, version]) => [tool, { version }]),
    ),
    entry,
    ...(substituted.length > 0 ? { substitute: substituted } : {}),
  };

  // 临时目录放在 userDir 里，这样最后是同一个卷里的改名；改名不覆盖已有的名字
  const tempDir = joinPath(
    input.userDir,
    posixRelPath(`.saving-${id}-${(input.nonce ?? randomSuffix)()}`),
  );
  try {
    await platform.fs.makeDir(joinPath(tempDir, posixRelPath("files")));
    await platform.fs.writeFile(
      joinPath(tempDir, posixRelPath("template.json")),
      `${JSON.stringify(templateJson, null, 2)}\n`,
    );
    for (const [path, bytes] of contents) {
      const target = joinPath(tempDir, posixRelPath(`files/${path}`));
      await platform.fs.makeDir(absPath(dirname(target)));
      await platform.fs.writeFile(target, bytes);
    }
    await platform.fs.moveDir(tempDir, finalDir);
  } catch (error) {
    // 半成品只进废纸篓里，不留在模板目录下；废纸篓用不了时也不退到永久删除
    await platform.fs.trash(tempDir).catch(() => undefined);
    throw error;
  }
  return { id, name, path: finalDir, files, source: "user" };
}
