import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { FileChange } from "../../../shared/editor-files.ts";
import { watchProject } from "../../shared/project-watch.ts";

// 智能提示要的项目文件来源：列出项目里的脚本文件、读内容、听磁盘变化。
// 编辑器本身只认这个接口，所以测试里换成内存里的项目就行。

export interface ProjectSource {
  /** 项目里所有 TS、JS 脚本的相对路径（不含依赖文件夹和构建产物） */
  listScripts(): Promise<string[]>;
  /** 读文本内容；读不到、不是文本、太大都是 null */
  read(path: string): Promise<string | null>;
  /** 磁盘上的变化；返回取消监听的函数 */
  watch(listener: (changes: FileChange[]) => void): () => void;
}

/** 这些后缀的文件交给 TS 语言服务（.vue 只有着色，不进语言服务，规格 DESKTOP-EDITOR-46） */
export const SCRIPT_EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"] as const;

export function isScriptPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return (
    dot > path.lastIndexOf("/") + 1 &&
    (SCRIPT_EXTENSIONS as readonly string[]).includes(path.slice(dot + 1).toLowerCase())
  );
}

/** 不扫描：依赖（P1 才做类型）、版本库、管理目录、构建产物 */
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", ".runyard", "dist"]);
/** 单个文件超过它不登记（语言服务同步的是全文，大文件拖慢所有人）；总数也封顶 */
export const MAX_SCRIPT_BYTES = 512 * 1024;
export const MAX_SCRIPT_FILES = 3000;
export const READ_PARALLEL = 16;

export function bridgeProjectSource(bridge: DesktopBridge, project: string): ProjectSource {
  async function walk(folder: string, found: string[]): Promise<void> {
    if (found.length >= MAX_SCRIPT_FILES) return;
    const listed = await bridge.call("files.list", { project, path: folder }).catch(() => null);
    if (listed === null || !listed.ok) return;
    const folders: string[] = [];
    for (const entry of listed.value) {
      if (entry.kind === "folder") {
        if (!entry.symlink && !SKIPPED_FOLDERS.has(entry.name)) folders.push(entry.path);
      } else if (isScriptPath(entry.path)) {
        found.push(entry.path);
      }
    }
    for (let i = 0; i < folders.length; i += READ_PARALLEL) {
      await Promise.all(folders.slice(i, i + READ_PARALLEL).map((child) => walk(child, found)));
    }
  }
  return {
    async listScripts() {
      const found: string[] = [];
      await walk("", found);
      return found.slice(0, MAX_SCRIPT_FILES);
    },
    async read(path) {
      const result = await bridge.call("files.read", { project, path }).catch(() => null);
      if (result === null || !result.ok || result.value.kind !== "text") return null;
      if (result.value.size > MAX_SCRIPT_BYTES) return null;
      return result.value.content.startsWith("﻿")
        ? result.value.content.slice(1)
        : result.value.content;
    },
    watch: (listener) => watchProject(bridge, project, (payload) => listener(payload.changes)),
  };
}
