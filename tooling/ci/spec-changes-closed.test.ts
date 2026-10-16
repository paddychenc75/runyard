import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { changesClosedErrors, openChanges } from "./spec-changes-closed.ts";

const script = join(import.meta.dirname, "spec-changes-closed.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(...folders: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "spec-closed-"));
  dirs.push(dir);
  for (const folder of folders)
    mkdirSync(join(dir, "openspec", "changes", folder), { recursive: true });
  return dir;
}

describe("spec-changes-closed", () => {
  it("好样例：没有 changes 目录，或只有被忽略的 archive", () => {
    expect(openChanges(repo())).toEqual([]);
    expect(openChanges(repo("archive"))).toEqual([]);
  });

  it("坏样例：还有改动文件夹时每个报一句指令", () => {
    const names = openChanges(repo("add-run-ownership", "archive", "change-port-range"));
    expect(names).toEqual(["add-run-ownership", "change-port-range"]);
    expect(changesClosedErrors(names)[0]).toContain("pnpm spec archive add-run-ownership --yes");
  });

  it("命令行：有未合并的改动时退出码 1，没有时 0", () => {
    const run = (root: string) =>
      spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    expect(run(repo()).status).toBe(0);
    const bad = run(repo("add-x"));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("openspec/changes/add-x/");
  });
});
