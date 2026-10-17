import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planProjectFiles } from "./save-template-plan.ts";

async function project(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ry-plan-"));
  for (const file of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "x");
  }
  return root;
}

describe("planProjectFiles", () => {
  it("[DESKTOP-TEMPLATES-VIEW-07] src、package.json 默认进模板；node_modules、.env、dist 默认不包含并写明原因，不进去列里面的东西", async () => {
    const root = await project([
      "src/index.ts",
      "package.json",
      "node_modules/hono/index.js",
      ".env",
      "dist/index.js",
      ".runyard/run.json",
      ".git/HEAD",
    ]);
    const plan = await planProjectFiles(root);
    expect(plan.files).toEqual(["package.json", "src/index.ts"]);
    expect(plan.excluded).toEqual([
      { path: ".env", directory: false, reason: "secret" },
      { path: "dist", directory: true, reason: "build" },
      { path: "node_modules", directory: true, reason: "dependencies" },
    ]);
  });

  it("构建产物目录只看项目根：src/build 照常进模板；深处的 node_modules 同样不进", async () => {
    const root = await project([
      "src/build/steps.ts",
      "packages/a/node_modules/x.js",
      "a/.env.local",
    ]);
    const plan = await planProjectFiles(root);
    expect(plan.files).toEqual(["src/build/steps.ts"]);
    expect(plan.excluded.map((entry) => entry.path)).toEqual([
      "a/.env.local",
      "packages/a/node_modules",
    ]);
  });
});
