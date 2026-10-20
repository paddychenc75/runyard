import { mkdtemp, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { type AbsPath, absPath } from "@runyard/platform";

/** 删除能力只属于本次mkdtemp生成的根及其中真实子路径，不接受用户模板目录。 */
export function tempWorkspace(tempDir: AbsPath) {
  let root: string | undefined;
  return {
    async create(): Promise<AbsPath> {
      root = await realpath(await mkdtemp(join(tempDir, "runyard-template-test-")));
      return absPath(root);
    },
    async remove(path: AbsPath): Promise<void> {
      if (root === undefined) throw new Error("workspace has not been created");
      const resolved = await realpath(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (resolved === undefined) return;
      const rel = relative(root, resolved);
      if (isAbsolute(rel) || rel === ".." || rel.split(/[\\/]/)[0] === "..")
        throw new Error("refusing cleanup outside owned workspace");
      // delete-allow: 仅清理本次mkdtemp独占目录及其已核对真实路径的子目录；用户模板只读
      await rm(resolved, { recursive: true, force: true });
    },
  };
}
