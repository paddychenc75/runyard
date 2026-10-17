import { access, constants, lstat, mkdir, open, readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { absPath, isPlatformError, type Platform } from "@runyard/platform";
import {
  type EditorFileResult,
  type FileChange,
  type FileContent,
  type FileEntry,
  LARGE_FILE_BYTES,
  MAX_OPEN_BYTES,
} from "../../shared/editor-files.ts";
import { ChangeFeed } from "./change-feed.ts";
import { confine } from "./confine.ts";
import { checkEntryName } from "./entry-name.ts";
import { errnoOf, fail, isPermissionError, run } from "./failure.ts";
import { listProjectFiles } from "./list-project-files.ts";
import { applyLineEnding, decodeText, detectLineEnding } from "./text-file.ts";

// 编辑器的文件服务（技术设计 §2.2 的 fs-host 职责，规格 desktop/editor）。
// 只做项目文件夹内的事：读、写（原子，保留换行）、新建、改名、移到废纸篓、列目录、监听。
// 平台差异全在 Platform 里；这里只拿到“最小的一份”，类型上就没有永久删除（没有 removeFile）。

export interface EditorPlatform {
  fs: Pick<Platform["fs"], "readBytes" | "renameFile" | "moveDir" | "trash" | "writeAtomic">;
  watch: Platform["watch"];
}

export interface EditorFileServiceDeps {
  platform: EditorPlatform;
  /** 项目 id 对应的项目文件夹；不认识的 id 返回 null（每次调用都重新查，项目改名后路径会变） */
  projectFolder: (project: string) => string | null;
  /** 监听到的变化（已整理，标好是否自己引起） */
  onChange: (project: string, changes: FileChange[]) => void;
  now?: () => number;
}

/** 树里不显示的文件夹（规格 DESKTOP-EDITOR-02）；依赖目录照常列出、点开才读，所以不在这里 */
const HIDDEN_IN_TREE = new Set([".runyard", ".git"]);

const collator = new Intl.Collator("en", { numeric: true });

export class EditorFileService {
  readonly #deps: EditorFileServiceDeps;
  readonly #feeds = new Map<string, ChangeFeed>();
  readonly #now: () => number;

  constructor(deps: EditorFileServiceDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
  }

  #folder(project: string): string {
    const folder = this.#deps.projectFolder(project);
    if (folder === null) throw fail("EDITOR_PROJECT_UNKNOWN", { project });
    return folder;
  }

  /** 项目内相对路径对应的绝对路径（已限定在项目文件夹内）；不存在或越界是 null。给“在访达中显示”用 */
  async absolutePath(project: string, path: string): Promise<string | null> {
    try {
      return (await confine(this.#folder(project), path)).abs;
    } catch {
      return null;
    }
  }

  /** 目录的直接子项：文件夹在前，同类按名称排序；不递归，所以 node_modules 点开才读 */
  list(project: string, path: string): Promise<EditorFileResult<FileEntry[]>> {
    return run(path, async () => {
      const { abs } = await confine(this.#folder(project), path);
      const info = await stat(abs).catch(() => null);
      if (info === null) throw fail("EDITOR_NOT_FOUND", { path });
      if (!info.isDirectory()) throw fail("EDITOR_NOT_A_FOLDER", { path });
      const entries: FileEntry[] = [];
      for (const dirent of await readdir(abs, { withFileTypes: true })) {
        if (HIDDEN_IN_TREE.has(dirent.name)) continue;
        const symlink = dirent.isSymbolicLink();
        // 链接按它指向的东西分类；悬空的链接当文件列出
        const isFolder = symlink
          ? ((await stat(join(abs, dirent.name)).catch(() => null))?.isDirectory() ?? false)
          : dirent.isDirectory();
        entries.push({
          name: dirent.name,
          path: path === "" ? dirent.name : `${path}/${dirent.name}`,
          kind: isFolder ? "folder" : "file",
          symlink,
        });
      }
      return entries.sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) ||
          collator.compare(a.name, b.name),
      );
    });
  }

  /** 项目里全部文件（快速打开用）：递归、不含内部和依赖和构建产物目录 */
  listAll(project: string): Promise<EditorFileResult<string[]>> {
    return run("", async () => listProjectFiles((await confine(this.#folder(project), "")).abs));
  }

  read(project: string, path: string): Promise<EditorFileResult<FileContent>> {
    return run(path, async () => {
      const { abs } = await confine(this.#folder(project), path);
      const info = await stat(abs).catch(() => null);
      if (info === null) throw fail("EDITOR_NOT_FOUND", { path });
      if (!info.isFile()) throw fail("EDITOR_NOT_A_FILE", { path });
      if (info.size > MAX_OPEN_BYTES) return { kind: "too-large", size: info.size };
      const bytes = await this.#deps.platform.fs.readBytes(absPath(abs));
      if (bytes === null) throw fail("EDITOR_NOT_FOUND", { path });
      const content = decodeText(bytes);
      if (content === null) return { kind: "binary", size: bytes.byteLength };
      return {
        kind: "text",
        content,
        eol: detectLineEnding(content),
        size: bytes.byteLength,
        large: bytes.byteLength > LARGE_FILE_BYTES,
      };
    });
  }

  /**
   * 原子地写入：先写同目录临时文件再改名，中途失败旧文件完好（规格 DESKTOP-EDITOR-29）。
   * 改名式写入会无视文件自己的只读位，所以先显式检查：只读的文件保存要失败，而不是悄悄覆盖。
   * 文件不存在（被外部删除后按保存）就重新创建，上级文件夹必须还在。
   */
  write(
    project: string,
    path: string,
    content: string,
    eol?: "lf" | "crlf",
  ): Promise<EditorFileResult<{ size: number }>> {
    return run(path, async () => {
      if (path === "") throw fail("EDITOR_NOT_A_FILE", { path });
      const { abs } = await confine(this.#folder(project), path);
      const data = applyLineEnding(content, eol);
      await this.#saveFile(project, path, abs, data);
      return { size: Buffer.byteLength(data, "utf8") };
    });
  }

  async #saveFile(project: string, path: string, abs: string, data: string): Promise<void> {
    const existing = await stat(abs).catch(() => null);
    if (existing !== null && !existing.isFile()) throw fail("EDITOR_NOT_A_FILE", { path });
    if (existing === null && (await stat(dirname(abs)).catch(() => null))?.isDirectory() !== true) {
      throw fail("EDITOR_NOT_FOUND", { path });
    }
    if (existing !== null) {
      const writable = await access(abs, constants.W_OK).then(
        () => true,
        () => false,
      );
      if (!writable) throw fail("EDITOR_SAVE_FAILED", { path, reason: "read-only" });
    }
    const feed = this.#feeds.get(project);
    feed?.noteOwnWrite(path, data);
    try {
      await this.#deps.platform.fs.writeAtomic(absPath(abs), data);
    } catch (error) {
      feed?.forgetOwnWrite(path, data);
      throw fail("EDITOR_SAVE_FAILED", {
        path,
        reason: isPermissionError(error) ? "permission" : "other",
      });
    }
  }

  /** 在 parent（文件夹，项目根是空串）下新建空文件或文件夹；同名不创建也不覆盖 */
  create(
    project: string,
    parent: string,
    kind: "file" | "folder",
    name: string,
  ): Promise<EditorFileResult<{ path: string }>> {
    return run(parent, async () => {
      const problem = checkEntryName(name);
      if (problem !== null) throw fail("EDITOR_NAME_INVALID", { name, reason: problem });
      const { abs: parentAbs } = await confine(this.#folder(project), parent);
      const parentInfo = await stat(parentAbs).catch(() => null);
      if (parentInfo === null) throw fail("EDITOR_NOT_FOUND", { path: parent });
      if (!parentInfo.isDirectory()) throw fail("EDITOR_NOT_A_FOLDER", { path: parent });
      const path = parent === "" ? name : `${parent}/${name}`;
      // 新名字本身也要核对：目标位置已有指向项目外的悬空链接时，不能顺着它建出去
      const { abs } = await confine(this.#folder(project), path, "self");
      try {
        if (kind === "folder") await mkdir(abs);
        else await (await open(abs, "wx")).close();
      } catch (error) {
        if (errnoOf(error) === "EEXIST") throw fail("EDITOR_NAME_EXISTS", { name });
        if (isPermissionError(error))
          throw fail("EDITOR_SAVE_FAILED", { path, reason: "permission" });
        throw error;
      }
      return { path };
    });
  }

  /** 原地改名（只换最后一段）。不覆盖已有的同名项；文件夹整体改名，里面的相对路径随之变 */
  rename(
    project: string,
    path: string,
    newName: string,
  ): Promise<EditorFileResult<{ path: string }>> {
    return run(path, async () => {
      if (path === "") throw fail("EDITOR_PATH_OUTSIDE", { path });
      const problem = checkEntryName(newName);
      if (problem !== null) throw fail("EDITOR_NAME_INVALID", { name: newName, reason: problem });
      const folder = this.#folder(project);
      const { abs: from } = await confine(folder, path, "self");
      const info = await lstat(from).catch(() => null);
      if (info === null) throw fail("EDITOR_NOT_FOUND", { path });
      const parentRel = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const newPath = parentRel === "" ? newName : `${parentRel}/${newName}`;
      const { abs: to } = await confine(folder, newPath, "self");
      if (basename(from) === newName) return { path };
      try {
        if (info.isDirectory()) await this.#deps.platform.fs.moveDir(absPath(from), absPath(to));
        else await this.#deps.platform.fs.renameFile(absPath(from), absPath(to));
      } catch (error) {
        if (isPlatformError(error) && error.error.code === "NAME_EXISTS") {
          throw fail("EDITOR_NAME_EXISTS", { name: newName });
        }
        if (isPermissionError(error))
          throw fail("EDITOR_SAVE_FAILED", { path, reason: "permission" });
        throw error;
      }
      return { path: newPath };
    });
  }

  /**
   * 移到废纸篓（只经平台层，放不进就失败，文件留在原处，绝不永久删除，决策记录 0010）。
   * unsaved 有值：先原子地写进去，所以废纸篓里的文件含有那些修改；写入失败就不移走。
   */
  trash(
    project: string,
    path: string,
    unsaved?: string,
  ): Promise<EditorFileResult<{ restorable: boolean }>> {
    return run(path, async () => {
      if (path === "") throw fail("EDITOR_PATH_OUTSIDE", { path });
      const { abs } = await confine(this.#folder(project), path, "self");
      const info = await lstat(abs).catch(() => null);
      if (info === null) throw fail("EDITOR_NOT_FOUND", { path });
      if (unsaved !== undefined && info.isFile()) {
        await this.#saveFile(
          project,
          path,
          (await confine(this.#folder(project), path)).abs,
          unsaved,
        );
      }
      try {
        const result = await this.#deps.platform.fs.trash(absPath(abs));
        return { restorable: result.restorable };
      } catch {
        throw fail("EDITOR_TRASH_FAILED", { path });
      }
    });
  }

  /** 开始监听项目文件夹（目录树、外部修改提示都靠它）；已在监听就什么都不做 */
  watch(project: string): Promise<EditorFileResult<null>> {
    return run("", async () => {
      if (this.#feeds.has(project)) return null;
      const { root } = await confine(this.#folder(project), "");
      const feed = new ChangeFeed({
        readBytes: this.#deps.platform.fs.readBytes,
        now: this.#now,
        folder: absPath(root),
        emit: (changes) => this.#deps.onChange(project, changes),
      });
      this.#feeds.set(project, feed);
      try {
        await feed.start(this.#deps.platform.watch);
      } catch (error) {
        this.#feeds.delete(project);
        throw error;
      }
      return null;
    });
  }

  isWatching(project: string): boolean {
    return this.#feeds.has(project);
  }

  /** 停止监听；项目改名、移到废纸篓前要先停（技术设计 §6.4） */
  async unwatch(project: string): Promise<void> {
    const feed = this.#feeds.get(project);
    this.#feeds.delete(project);
    await feed?.stop();
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#feeds.keys()].map((project) => this.unwatch(project)));
  }
}
