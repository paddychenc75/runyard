import { access, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { absPath } from "@runyard/platform";
import { expect, it } from "vitest";
import { tempWorkspace } from "./temp-workspace.ts";

it("[TEMPLATES-FORMAT-50] 系统临时目录创建且结束后删除，仓库和用户路径拒绝清理", async () => {
  const workspace = tempWorkspace(absPath(tmpdir()));
  const root = await workspace.create();
  const foreign = tempWorkspace(absPath(tmpdir()));
  const outside = await foreign.create();
  try {
    expect(relative(import.meta.dirname, root).split(/[\\/]/)[0]).toBe("..");
    await writeFile(join(root, "sample.txt"), "owned");
    await expect(workspace.remove(outside)).rejects.toThrow("outside owned workspace");
    await expect(access(outside)).resolves.toBeUndefined();
    await workspace.remove(root);
    await expect(access(root)).rejects.toThrow();
  } finally {
    await workspace.remove(root);
    await foreign.remove(outside);
  }
});
it("清理拒绝通过目录符号链接进入另一个根", async () => {
  const workspace = tempWorkspace(absPath(tmpdir()));
  const root = await workspace.create();
  const foreign = tempWorkspace(absPath(tmpdir()));
  const outside = await foreign.create();
  try {
    await mkdir(join(outside, "child"));
    await symlink(outside, join(root, "escape"));
    await expect(workspace.remove(absPath(join(root, "escape", "child")))).rejects.toThrow(
      "outside owned workspace",
    );
    await expect(access(join(outside, "child"))).resolves.toBeUndefined();
    await workspace.remove(root);
    await expect(access(join(outside, "child"))).resolves.toBeUndefined();
  } finally {
    await workspace.remove(root);
    await foreign.remove(outside);
  }
});
