import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import type { FileChange } from "../../shared/editor-files.ts";
import { EditorFileService, type EditorPlatform } from "./file-service.ts";

// 文件服务测试共用的测试用项目：每个测试自己的临时根目录（根下有假主目录 home、项目 project、假废纸篓 trash）。
// 文件服务的规格是“绝不永久删除”，测试也不删：临时目录留给系统清理 tmpdir。

export interface TestProject {
  root: string;
  home: string;
  folder: string;
  trashDir: string;
  /** 项目里的绝对路径 */
  at(...parts: string[]): string;
  put(rel: string, content: string | Uint8Array): void;
  changes: FileChange[];
  service: EditorFileService;
  trashCalls: string[];
}

export interface TestProjectOptions {
  /** 换掉废纸篓：缺省把条目改名进 trashDir（假废纸篓，不碰真的 ~/.Trash） */
  trash?: EditorPlatform["fs"]["trash"];
}

export const PROJECT = "demo";

export function makeTestProject(options: TestProjectOptions = {}): TestProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-editor-")));
  const home = join(root, "home");
  const folder = join(root, "project");
  const trashDir = join(root, "trash");
  for (const dir of [home, folder, trashDir]) mkdirSync(dir);
  const real = getPlatform({ home: absPath(home) });
  const trashCalls: string[] = [];
  const platform: EditorPlatform = {
    fs: {
      ...real.fs,
      trash:
        options.trash ??
        (async (path) => {
          trashCalls.push(path);
          renameSync(path, join(trashDir, `${trashCalls.length}-${path.split("/").pop()}`));
          return { restorable: false, removedDirectly: [] };
        }),
    },
    watch: real.watch,
  };
  const changes: FileChange[] = [];
  const service = new EditorFileService({
    platform,
    projectFolder: (id) => (id === PROJECT ? folder : null),
    onChange: (_project, batch) => changes.push(...batch),
  });
  return {
    root,
    home,
    folder,
    trashDir,
    at: (...parts) => join(folder, ...parts),
    put(rel, content) {
      const file = join(folder, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    },
    changes,
    service,
    trashCalls,
  };
}
