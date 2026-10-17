import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listProjectFiles } from "./list-project-files.ts";

async function project(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ry-list-"));
  for (const file of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "x");
  }
  return root;
}

describe("listProjectFiles", () => {
  it("[DESKTOP-EDITOR-71] 不列内部、依赖和构建产物目录里的文件", async () => {
    const root = await project([
      "src/App.tsx",
      "index.html",
      ".runyard/run.json",
      ".git/HEAD",
      "node_modules/react/index.js",
      ".venv/bin/python",
      "dist/index.html",
      "src/__pycache__/a.pyc",
      "src/build/steps.ts",
    ]);
    const listed = (await listProjectFiles(root)).sort();
    expect(listed).toEqual(["index.html", "src/App.tsx", "src/build/steps.ts"]);
  });

  it("[DESKTOP-EDITOR-72] 新建的文件下一次列出就有", async () => {
    const root = await project(["src/App.tsx"]);
    await writeFile(join(root, "src", "new-util.ts"), "x");
    expect(await listProjectFiles(root)).toContain("src/new-util.ts");
  });

  it("文件夹的符号链接不跟进，不会绕圈", async () => {
    const root = await project(["src/App.tsx"]);
    await symlink(root, join(root, "src", "loop"));
    const listed = await listProjectFiles(root);
    expect(listed).toEqual(["src/App.tsx"]);
  });
});
