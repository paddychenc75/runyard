import { basename, dirname, join, relative } from "node:path";
import {
  type AbsPath,
  absPath,
  type PosixRelPath,
  platformError,
  posixRelPath,
  type TrashResult,
  type WatchEvent,
  type WatchOptions,
} from "@runyard/platform";

export interface TrashedEntry {
  readonly path: AbsPath;
  readonly files: readonly AbsPath[];
}

interface Watcher {
  readonly root: AbsPath;
  readonly ignore: readonly PosixRelPath[];
  readonly depth: number;
  readonly callback: (events: WatchEvent[]) => void;
}

// 两种分隔符都认：测试里写的 "/lib/demo" 和 Windows 上 join 出来的路径都要能比较
const SEPARATOR = /[\\/]/;

function within(parent: string, child: string): boolean {
  if (child === parent) return true;
  const base = /[\\/]$/.test(parent) ? parent.slice(0, -1) : parent;
  return child.startsWith(`${base}/`) || child.startsWith(`${base}\\`);
}

// 内存文件系统：只放 Runyard 自己要断言的东西（文件内容、目录是否存在、改名、废纸篓、监视）。
// 路径是 AbsPath，按本机路径工具比较，不手写分隔符。
export class MemoryFs {
  readonly #files = new Map<string, string>();
  readonly #dirs = new Set<string>();
  readonly #locked = new Set<string>();
  readonly #watchers = new Set<Watcher>();
  #trashFails = false;
  readonly trashed: TrashedEntry[] = [];

  mkdir(path: AbsPath): void {
    let current: string = path;
    while (!this.#dirs.has(current)) {
      this.#dirs.add(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  /** 写文件，缺的父目录一并建好（测试布置现场用；平台接口的 writeAtomic 要求父目录已存在） */
  writeFile(path: AbsPath, data: string): void {
    this.mkdir(absPath(dirname(path)));
    const existed = this.#files.has(path);
    this.#files.set(path, data);
    this.#emit(path, existed ? "change" : "add");
  }

  readFile(path: AbsPath): string {
    const data = this.#files.get(path);
    if (data === undefined) throw platformError("INTERNAL", {}, `ENOENT: ${path}`);
    return data;
  }

  exists(path: AbsPath): boolean {
    return this.#files.has(path) || this.#dirs.has(path);
  }

  /** 平台接口 readText：文件的内容；不存在或不是文件返回 null */
  readText(path: AbsPath): string | null {
    return this.#files.get(path) ?? null;
  }

  /** 平台接口 listDirs：目录下一层的子目录名，排好序；目录不存在返回空数组 */
  listDirs(dir: AbsPath): string[] {
    return this.list(dir).filter((name) => this.#dirs.has(join(dir, name)));
  }

  /** 平台接口 writeFile：与真实实现一样，父目录必须已存在 */
  writeFileChecked(path: AbsPath, data: string | Uint8Array): void {
    if (!this.#dirs.has(dirname(path))) {
      throw platformError("INTERNAL", {}, `ENOENT: ${dirname(path)}`);
    }
    this.writeFile(path, typeof data === "string" ? data : new TextDecoder().decode(data));
  }

  /** 平台接口 renameFile：目标已存在抛 NAME_EXISTS，不覆盖 */
  renameFile(from: AbsPath, to: AbsPath): void {
    if (!this.#files.has(from)) throw platformError("INTERNAL", {}, `ENOENT: ${from}`);
    if (this.exists(to)) {
      throw platformError("NAME_EXISTS", { name: basename(to) }, `EEXIST: ${to}`);
    }
    const data = this.readFile(from);
    this.#files.delete(from);
    this.#emit(from, "remove");
    this.writeFile(to, data);
  }

  /** 目录下一层的名字，排好序 */
  list(dir: AbsPath): string[] {
    const names = new Set<string>();
    for (const entry of [...this.#files.keys(), ...this.#dirs]) {
      if (entry === dir || !within(dir, entry)) continue;
      names.add(relative(dir, entry).split(SEPARATOR)[0] as string);
    }
    return [...names].sort();
  }

  remove(path: AbsPath): void {
    for (const file of this.#under(path).files) {
      this.#files.delete(file);
      this.#emit(file as AbsPath, "remove");
    }
    for (const dir of this.#under(path).dirs) this.#dirs.delete(dir);
  }

  /** 这个路径（及其下）被别的进程占着：moveDir 会抛 PATH_LOCKED，目录保持原样 */
  lock(path: AbsPath): void {
    this.#locked.add(path);
  }

  unlock(path: AbsPath): void {
    this.#locked.delete(path);
  }

  /** 让废纸篓不可用：trash 抛 TRASH_UNAVAILABLE，目录保持原样 */
  failTrash(fails = true): void {
    this.#trashFails = fails;
  }

  moveDir(from: AbsPath, to: AbsPath, name: string): void {
    if (!this.#dirs.has(from)) throw platformError("FOLDER_MISSING", { name }, `ENOENT: ${from}`);
    if (this.exists(to))
      throw platformError("NAME_EXISTS", { name: basename(to) }, `EEXIST: ${to}`);
    if ([...this.#locked].some((lock) => within(from, lock) || within(lock, from))) {
      throw platformError("PATH_LOCKED", { name }, `EBUSY: ${from}`);
    }
    const { files, dirs } = this.#under(from);
    for (const file of files) {
      const target = to + file.slice(from.length);
      this.#files.set(target, this.#files.get(file) as string);
      this.#files.delete(file);
      this.#emit(file as AbsPath, "remove");
      this.#emit(target as AbsPath, "add");
    }
    for (const dir of dirs) {
      this.#dirs.delete(dir);
      this.#dirs.add(to + dir.slice(from.length));
    }
    this.mkdir(absPath(dirname(to)));
  }

  // 与 macOS 一致：整个目录进废纸篓，可放回原处，没有被直接删除的子路径
  trash(dir: AbsPath, name: string): TrashResult {
    if (this.#trashFails) {
      throw platformError("TRASH_UNAVAILABLE", { name }, "fake trash is unavailable");
    }
    if (!this.#dirs.has(dir)) throw platformError("FOLDER_MISSING", { name }, `ENOENT: ${dir}`);
    this.trashed.push({ path: dir, files: this.#under(dir).files as AbsPath[] });
    this.remove(dir);
    return { restorable: true, removedDirectly: [] };
  }

  writeAtomic(file: AbsPath, data: string): void {
    if (!this.#dirs.has(dirname(file))) {
      throw platformError("INTERNAL", {}, `ENOENT: ${dirname(file)}`);
    }
    this.writeFile(file, data);
  }

  watch(root: AbsPath, options: WatchOptions, callback: (events: WatchEvent[]) => void) {
    const watcher: Watcher = {
      root,
      ignore: options.ignore ?? [],
      depth: options.depth ?? Number.POSITIVE_INFINITY,
      callback,
    };
    this.#watchers.add(watcher);
    return { dispose: async () => void this.#watchers.delete(watcher) };
  }

  #under(path: string): { files: string[]; dirs: string[] } {
    return {
      files: [...this.#files.keys()].filter((file) => within(path, file)),
      dirs: [...this.#dirs].filter((dir) => within(path, dir)),
    };
  }

  // 同步通知：测试里不必再等一轮事件
  #emit(path: AbsPath, kind: WatchEvent["kind"]): void {
    for (const watcher of this.#watchers) {
      if (!within(watcher.root, path) || path === watcher.root) continue;
      const rel = posixRelPath(relative(watcher.root, path).split(SEPARATOR).join("/"));
      if (rel.split("/").length > watcher.depth) continue;
      if (watcher.ignore.some((ignored) => rel === ignored || rel.startsWith(`${ignored}/`)))
        continue;
      watcher.callback([{ kind, path: rel }]);
    }
  }
}
