import { basename, dirname, join, relative } from "node:path";
import {
  type AbsPath,
  absPath,
  type DirScan,
  type PosixRelPath,
  platformError,
  posixRelPath,
  type TrashResult,
  type WatchEvent,
  type WatchOptions,
} from "@runyard/platform";

// 假文件系统里的块大小：与 APFS 一致，空文件不占块
const BLOCK_BYTES = 4096;
const blocksOf = (length: number): number => Math.ceil(length / BLOCK_BYTES) * BLOCK_BYTES;

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
  // 文本存字符串，二进制存字节：模板另存要逐字节保留图片
  readonly #files = new Map<string, string | Uint8Array>();
  readonly #dirs = new Set<string>();
  readonly #locked = new Set<string>();
  readonly #watchers = new Set<Watcher>();
  #trashFails = false;
  // 磁盘占用用的现场（scanDir）：符号链接、硬链接、挂载的卷、读不了的目录、不返回的遍历、遍历中的钩子
  readonly #symlinks = new Set<string>();
  readonly #inodes = new Map<string, number>();
  readonly #volumes = new Map<string, number>();
  readonly #unreadable = new Set<string>();
  readonly #hanging = new Set<string>();
  #nextInode = 1;
  /** 每次 scanDir 开始读某个目录之前调用，测试在这里让文件“中途消失” */
  onScanDir: ((dir: AbsPath) => void) | undefined;
  /** 每个目录被 scanDir 读过的次数（“没有变化不重算”要断言没再遍历） */
  readonly scanCounts = new Map<string, number>();
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
  writeFile(path: AbsPath, data: string | Uint8Array): void {
    this.mkdir(absPath(dirname(path)));
    const existed = this.#files.has(path);
    this.#files.set(path, data);
    this.#emit(path, existed ? "change" : "add");
  }

  readFile(path: AbsPath): string {
    const data = this.#files.get(path);
    if (data === undefined) throw platformError("INTERNAL", {}, `ENOENT: ${path}`);
    return typeof data === "string" ? data : new TextDecoder().decode(data);
  }

  exists(path: AbsPath): boolean {
    return this.#files.has(path) || this.#dirs.has(path);
  }

  /** 平台接口 readText：文件的内容；不存在或不是文件返回 null */
  readText(path: AbsPath): string | null {
    const data = this.#files.get(path);
    if (data === undefined) return null;
    return typeof data === "string" ? data : new TextDecoder().decode(data);
  }

  /** 平台接口 readBytes：文件的原样字节；不存在或不是文件返回 null */
  readBytes(path: AbsPath): Uint8Array | null {
    const data = this.#files.get(path);
    if (data === undefined) return null;
    return typeof data === "string" ? new TextEncoder().encode(data) : data;
  }

  /** 平台接口 listFiles：目录下一层的文件名，排好序；目录不存在返回空数组 */
  listFiles(dir: AbsPath): string[] {
    return this.list(dir).filter((name) => this.#files.has(join(dir, name)));
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
    this.writeFile(path, data);
  }

  /** 平台接口 appendFile：父目录必须已存在，文件不存在就建 */
  appendFileChecked(path: AbsPath, data: string): void {
    if (!this.#dirs.has(dirname(path))) {
      throw platformError("INTERNAL", {}, `ENOENT: ${dirname(path)}`);
    }
    const existing = this.#files.get(path);
    if (existing === undefined) this.writeFile(path, data);
    else this.writeFile(path, `${this.readFile(path)}${data}`);
  }

  /** 平台接口 removeFile：不存在不报错；目录不删 */
  removeFileChecked(path: AbsPath): void {
    if (this.#dirs.has(path)) {
      throw platformError("INTERNAL", {}, `removeFile target is not a regular file: ${path}`);
    }
    if (!this.#files.has(path)) return;
    this.#files.delete(path);
    this.#emit(path, "remove");
  }

  /** 平台接口 renameFile：目标已存在抛 NAME_EXISTS，不覆盖 */
  renameFile(from: AbsPath, to: AbsPath): void {
    if (!this.#files.has(from)) throw platformError("INTERNAL", {}, `ENOENT: ${from}`);
    if (this.exists(to)) {
      throw platformError("NAME_EXISTS", { name: basename(to) }, `EEXIST: ${to}`);
    }
    const data = this.#files.get(from) as string | Uint8Array;
    this.#files.delete(from);
    this.#emit(from, "remove");
    this.writeFile(to, data);
  }

  /** 符号链接：只占链接本身的一块，不跟随（假文件系统里它不指向任何东西） */
  symlink(path: AbsPath): void {
    this.mkdir(absPath(dirname(path)));
    this.#symlinks.add(path);
  }

  /** 硬链接：与 target 共用同一个 inode */
  hardLink(path: AbsPath, target: AbsPath): void {
    const data = this.#files.get(target);
    if (data === undefined) throw platformError("INTERNAL", {}, `ENOENT: ${target}`);
    this.writeFile(path, data);
    this.#inodes.set(path, this.#inodeOf(target));
  }

  /** 把 dir 当作另一个卷的挂载点（设备号不同于其余部分） */
  mount(dir: AbsPath, device: number): void {
    this.mkdir(dir);
    this.#volumes.set(dir, device);
  }

  /** 没有权限读这个目录：scanDir 抛 PATH_LOCKED */
  denyRead(dir: AbsPath, denied = true): void {
    if (denied) this.#unreadable.add(dir);
    else this.#unreadable.delete(dir);
  }

  /** 读这个目录的遍历永远不结束（规格 LIBRARY-DISK-USAGE-03） */
  hangScan(dir: AbsPath): void {
    this.#hanging.add(dir);
  }

  /** 平台接口 scanDir */
  scanDir(dir: AbsPath): Promise<DirScan | null> {
    this.scanCounts.set(dir, (this.scanCounts.get(dir) ?? 0) + 1);
    if (this.#hanging.has(dir)) return new Promise(() => {});
    this.onScanDir?.(dir);
    if (!this.#dirs.has(dir)) return Promise.resolve(null);
    if (this.#unreadable.has(dir)) {
      return Promise.reject(
        platformError("PATH_LOCKED", { name: basename(dir) }, `EACCES: ${dir}`),
      );
    }
    const device = (path: string) => this.#deviceOf(path);
    const entries: DirScan["entries"][number][] = [];
    for (const name of this.list(dir)) {
      const path = join(dir, name);
      if (this.#symlinks.has(path)) {
        entries.push({
          name,
          kind: "symlink",
          bytes: BLOCK_BYTES,
          dev: device(path),
          ino: this.#inodeOf(path),
          nlink: 1,
        });
      } else if (this.#dirs.has(path)) {
        entries.push({
          name,
          kind: "dir",
          bytes: BLOCK_BYTES,
          dev: device(path),
          ino: this.#inodeOf(path),
          nlink: 2,
        });
      } else if (this.#files.has(path)) {
        const data = this.#files.get(path) as string | Uint8Array;
        const length =
          typeof data === "string" ? new TextEncoder().encode(data).length : data.length;
        const links = [...this.#inodes.values()].filter(
          (ino) => ino === this.#inodeOf(path),
        ).length;
        entries.push({
          name,
          kind: "file",
          bytes: blocksOf(length),
          dev: device(path),
          ino: this.#inodeOf(path),
          nlink: Math.max(1, links),
        });
      }
    }
    const self = {
      kind: "dir" as const,
      bytes: BLOCK_BYTES,
      dev: device(dir),
      ino: this.#inodeOf(dir),
      nlink: 2,
    };
    return Promise.resolve({ self, entries });
  }

  #inodeOf(path: string): number {
    let ino = this.#inodes.get(path);
    if (ino === undefined) {
      ino = this.#nextInode++;
      this.#inodes.set(path, ino);
    }
    return ino;
  }

  // 最近的挂载点决定设备号；没有挂载点的是设备 1
  #deviceOf(path: string): number {
    let best: [string, number] | undefined;
    for (const entry of this.#volumes) {
      if (within(entry[0], path) && (best === undefined || entry[0].length > best[0].length))
        best = entry;
    }
    return best?.[1] ?? 1;
  }

  /** 目录下一层的名字，排好序 */
  list(dir: AbsPath): string[] {
    const names = new Set<string>();
    for (const entry of [...this.#files.keys(), ...this.#dirs, ...this.#symlinks]) {
      if (entry === dir || !within(dir, entry)) continue;
      names.add(relative(dir, entry).split(SEPARATOR)[0] as string);
    }
    return [...names].sort();
  }

  remove(path: AbsPath): void {
    this.#symlinks.delete(path);
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
      this.#files.set(target, this.#files.get(file) as string | Uint8Array);
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
