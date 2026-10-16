import {
  type AbsPath,
  joinPath,
  type Platform,
  type PosixRelPath,
  posixRelPath,
} from "@runyard/platform";
import type { TemplateFolder } from "./lint-template.ts";

// 经平台层读文件夹（PR #106 只写了给仓库脚本用的 node:fs 版）。
// 同一份遍历给 template lint 的文件夹读取、template show 的文件列表和另存为模板共用。

// 符号链接不进来（listFiles 不列），指向目录的链接 listDirs 会列：设个深度上限，免得循环链接走不完
const MAX_DEPTH = 32;

/** 目录下所有普通文件的相对路径，用 `/` 分隔，排好序；目录不存在返回空数组 */
export async function listFolderFiles(
  platform: Platform,
  root: AbsPath,
  skip: (relative: string, isDirectory: boolean) => boolean = () => false,
): Promise<PosixRelPath[]> {
  const found: PosixRelPath[] = [];
  const walk = async (prefix: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    const dir = prefix === "" ? root : joinPath(root, posixRelPath(prefix));
    const here = prefix === "" ? "" : `${prefix}/`;
    for (const name of await platform.fs.listFiles(dir)) {
      if (!skip(`${here}${name}`, false)) found.push(posixRelPath(`${here}${name}`));
    }
    for (const name of await platform.fs.listDirs(dir)) {
      if (!skip(`${here}${name}`, true)) await walk(`${here}${name}`, depth + 1);
    }
  };
  await walk("", 0);
  return found.sort();
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/** 严格的 UTF-8 文本；含 NUL 或不是合法 UTF-8 的当作二进制，返回 undefined */
export function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * 读一个模板文件夹（template.json 加 files/）。没有 template.json 返回 null。
 * files/ 里的文本一次读进内存：模板很小，lint 的判定是同步的纯函数
 */
export async function readTemplateFolder(
  platform: Platform,
  dir: AbsPath,
): Promise<TemplateFolder | null> {
  const templateJson = await platform.fs.readText(joinPath(dir, posixRelPath("template.json")));
  if (templateJson === null) return null;
  const filesRoot = joinPath(dir, posixRelPath("files"));
  const texts = new Map<string, string | undefined>();
  for (const path of await listFolderFiles(platform, filesRoot)) {
    const bytes = await platform.fs.readBytes(joinPath(filesRoot, path));
    texts.set(path, bytes === null ? undefined : decodeText(bytes));
  }
  return {
    templateJson,
    has: (path) => texts.has(path),
    text: (path) => texts.get(path),
  };
}
