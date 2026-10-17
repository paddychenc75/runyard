import type { Dirent } from "node:fs";
import {
  appendFile,
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import type { Platform } from "../../platform.ts";
import { platformError } from "../../platform-error.ts";
import { errnoOf, fsError } from "./map-fs-error.ts";
import { renameNoReplace } from "./rename-no-replace.ts";
import { type AtomicOps, writeAtomic } from "./write-atomic.ts";

// darwin 与 linux 共用的 fs（不含 trash，废纸篓是各系统自己的事）。
// 成员的语义在 platform.ts；这里的共同点是：错误码经 fsError 翻成协议的代码，改名一律先占位再改（不盖已有的名字）。

export interface PosixFsOptions {
  readonly atomic?: AtomicOps;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

export function createPosixFs(options: PosixFsOptions = {}): Omit<Platform["fs"], "trash"> {
  return {
    async readText(file) {
      try {
        return await readFile(file, "utf8");
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
        throw fsError(error, file, "read");
      }
    },

    async readBytes(file) {
      try {
        return new Uint8Array(await readFile(file));
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
        throw fsError(error, file, "read");
      }
    },

    async readHead(file, length) {
      let handle: FileHandle | undefined;
      try {
        handle = await open(file, "r");
        if (!(await handle.stat()).isFile()) return null;
        const buffer = new Uint8Array(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
        throw fsError(error, file, "read");
      } finally {
        await handle?.close();
      }
    },

    async listFiles(dir) {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR") return [];
        throw fsError(error, dir, "list");
      }
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    },

    async listDirs(dir) {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR") return [];
        throw fsError(error, dir, "list");
      }
      const names: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) names.push(entry.name);
        // 指向目录的符号链接也算（用户可能把项目文件夹链进资源库）
        else if (entry.isSymbolicLink()) {
          const target = await stat(join(dir, entry.name)).catch(() => null);
          if (target?.isDirectory()) names.push(entry.name);
        }
      }
      return names.sort();
    },

    async exists(path) {
      try {
        await stat(path);
        return true;
      } catch (error) {
        // 悬空的符号链接：名字被占着，对“能不能建同名的”这个问题算存在
        const code = errnoOf(error);
        if (code === "ENOENT" || code === "ENOTDIR") {
          return (await lstat(path).catch(() => null)) !== null;
        }
        throw fsError(error, path, "exists");
      }
    },

    async makeDir(dir) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        throw fsError(error, dir, "mkdir");
      }
    },

    async writeFile(file, data) {
      try {
        await writeFile(file, data);
      } catch (error) {
        throw fsError(error, file, "write");
      }
    },

    async appendFile(file, data) {
      try {
        await appendFile(file, data);
      } catch (error) {
        throw fsError(error, file, "append");
      }
    },

    async removeFile(file) {
      const info = await lstat(file).catch((error) => {
        if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") return null;
        throw fsError(error, file, "remove");
      });
      if (info === null) return;
      if (!info.isFile()) {
        throw platformError("INTERNAL", {}, `removeFile target is not a regular file: ${file}`);
      }
      try {
        // delete-allow: 只删单个普通文件（管理进程自己的日志），目录和链接在上面已拒绝
        await unlink(file);
      } catch (error) {
        if (errnoOf(error) === "ENOENT") return;
        throw fsError(error, file, "remove");
      }
    },

    async renameFile(from, to) {
      await renameNoReplace(from, to, "file");
    },

    async moveDir(from, to) {
      const info = await stat(from).catch((error) => {
        if (errnoOf(error) === "ENOENT") {
          throw platformError(
            "FOLDER_MISSING",
            { name: basename(from) },
            `no such folder: ${from}`,
          );
        }
        throw fsError(error, from, "stat");
      });
      if (!info.isDirectory()) {
        throw platformError("INTERNAL", {}, `moveDir source is not a directory: ${from}`);
      }
      // 移进自己里面：占位会在源目录里建出一个目录，rename 又必然失败，直接拒绝
      if (isInside(from, to)) {
        throw platformError("INTERNAL", {}, `moveDir target is inside the source: ${to}`);
      }
      await renameNoReplace(from, to, "directory");
    },

    writeAtomic: (file: AbsPath, data: string, opts?: { private?: boolean }) =>
      writeAtomic(file, data, opts, options.atomic),
  };
}
