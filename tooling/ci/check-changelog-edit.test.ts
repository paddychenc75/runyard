import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkChangelogEdit, isReleasePullRequest } from "./check-changelog-edit.ts";

const script = join(import.meta.dirname, "check-changelog-edit.ts");
const botBranch = "release-please--branches--main--components--runyard";

describe("checkChangelogEdit", () => {
  it("没有动受保护的文件：通过", () => {
    expect(checkChangelogEdit([], "feature/x", "paddychenc75")).toEqual([]);
  });

  it("普通 PR 改了 CHANGELOG.md：报错并说明怎么办", () => {
    const errors = checkChangelogEdit(["CHANGELOG.md"], "feature/x", "paddychenc75");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("CHANGELOG.md");
    expect(errors[0]).toContain("docs/releases/");
  });

  it("发版 PR（机器人开的 release-please 分支）可以改", () => {
    expect(checkChangelogEdit(["CHANGELOG.md"], botBranch, "github-actions[bot]")).toEqual([]);
  });

  it("只有分支名像发版分支、作者是人：不放行", () => {
    expect(isReleasePullRequest(botBranch, "paddychenc75")).toBe(false);
    expect(checkChangelogEdit(["CHANGELOG.md"], botBranch, "paddychenc75")).toHaveLength(1);
  });

  it("只有作者是机器人、分支不是发版分支：不放行", () => {
    expect(isReleasePullRequest("renovate/x", "github-actions[bot]")).toBe(false);
  });
});

describe("命令行（真实的临时 git 仓库）", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd,
      encoding: "utf8",
    });
  }

  function repoWith(baseHasChangelog: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "changelog-edit-"));
    dirs.push(dir);
    git(dir, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "README.md"), "x\n");
    if (baseHasChangelog) writeFileSync(join(dir, "CHANGELOG.md"), "# 更新日志\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "base");
    git(dir, "checkout", "-qb", "work");
    return dir;
  }

  const run = (cwd: string, headRef: string, author: string) =>
    spawnSync(
      process.execPath,
      [script, "--range", "main...work", "--head-ref", headRef, "--author", author],
      { cwd, encoding: "utf8" },
    );

  it("基准里已有 CHANGELOG.md，普通 PR 改它：退出码 1", () => {
    const dir = repoWith(true);
    writeFileSync(join(dir, "CHANGELOG.md"), "# 更新日志\n手改\n");
    git(dir, "commit", "-aqm", "edit");
    const result = run(dir, "feature/x", "paddychenc75");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CHANGELOG.md");
  });

  it("同样的改动来自发版 PR：退出码 0", () => {
    const dir = repoWith(true);
    writeFileSync(join(dir, "CHANGELOG.md"), "# 更新日志\n生成的\n");
    git(dir, "commit", "-aqm", "edit");
    expect(run(dir, botBranch, "github-actions[bot]").status).toBe(0);
  });

  it("基准里还没有这个文件，PR 第一次加进来：退出码 0", () => {
    const dir = repoWith(false);
    writeFileSync(join(dir, "CHANGELOG.md"), "# 更新日志\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "add");
    expect(run(dir, "feature/x", "paddychenc75").status).toBe(0);
  });

  it("缺参数：退出码 2", () => {
    const result = spawnSync(process.execPath, [script, "--range", "main...work"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
  });
});
