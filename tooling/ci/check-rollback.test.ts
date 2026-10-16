import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describe as describeRollbacks, findRollbacks, isRevertTitle } from "./check-rollback.ts";

// 每个用例要建临时仓库、跑十几次 git；Windows 机器上 git 很慢，默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const script = join(import.meta.dirname, "check-rollback.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
}

function write(dir: string, file: string, text: string): void {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

const A_FILES = ["a1.txt", "a2.txt", "a3.txt"];

// main：c1（a1 到 a3、b.txt 都是 v1）、c2（别人合并的改动：a1 到 a3 改成 v2）、c3（只加 c.txt）；
// PR 分支 work 从 c3 长出来
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rollback-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  for (const f of [...A_FILES, "b.txt"]) write(dir, f, "v1\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "c1");
  for (const f of A_FILES) write(dir, f, "v2\n");
  git(dir, "commit", "-aqm", "fix: 别人合并的改动");
  write(dir, "c.txt", "v1\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "c3");
  git(dir, "checkout", "-qb", "work");
  return dir;
}

function stale(dir: string, files = A_FILES): void {
  for (const f of files) write(dir, f, "v1\n");
  git(dir, "commit", "-aqm", "test: 陈旧的副本");
}

describe("isRevertTitle", () => {
  it("识别 revert 的各种写法，不误认别的 type", () => {
    expect(isRevertTitle("revert: 撤销 x")).toBe(true);
    expect(isRevertTitle("revert(core): 撤销 x")).toBe(true);
    expect(isRevertTitle("fix(core): 撤销 x")).toBe(false);
    expect(isRevertTitle("feat: revert 相关")).toBe(false);
  });
});

describe("findRollbacks 与 describe（真实的临时 git 仓库）", () => {
  it("坏样例：PR 把三个文件改回别人合并之前的内容：全部查出，并指明是哪个提交", () => {
    const dir = repo();
    stale(dir);
    const found = findRollbacks("main", "work", undefined, dir);
    expect(found.map((r) => r.file).sort()).toEqual(A_FILES);
    expect(found[0]?.subject).toBe("fix: 别人合并的改动");
    const messages = describeRollbacks(found);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("a1.txt");
    expect(messages[0]).toContain("revert");
  });

  it("好样例：PR 把同样的文件正常改成新内容，另外改自己的文件：不报", () => {
    const dir = repo();
    for (const f of A_FILES) write(dir, f, "v3\n");
    write(dir, "b.txt", "v2\n");
    git(dir, "commit", "-aqm", "feat: 正常改动");
    expect(describeRollbacks(findRollbacks("main", "work", undefined, dir))).toEqual([]);
  });

  it("只撤销一两个文件（有意拆掉先前加的东西）：查得到，但不够数不报", () => {
    const dir = repo();
    stale(dir, ["a1.txt", "a2.txt"]);
    const found = findRollbacks("main", "work", undefined, dir);
    expect(found).toHaveLength(2);
    expect(describeRollbacks(found)).toEqual([]);
    expect(describeRollbacks(found, 2)).toHaveLength(1);
  });

  it("PR 没碰的文件，即使分支落后于 main 也不报", () => {
    const dir = repo();
    git(dir, "checkout", "-q", "main");
    git(dir, "checkout", "-qb", "behind", "main~2");
    write(dir, "b.txt", "v2\n");
    git(dir, "commit", "-aqm", "feat: 只改 b");
    expect(findRollbacks("main", "behind", undefined, dir)).toEqual([]);
  });

  it("新建和删除的文件不算", () => {
    const dir = repo();
    git(dir, "rm", "-q", "b.txt");
    write(dir, "d.txt", "v1\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "chore: 整理");
    expect(findRollbacks("main", "work", undefined, dir)).toEqual([]);
  });

  it("只看碰过该文件的最近 depth 个提交：更早的改动不查", () => {
    const dir = repo();
    git(dir, "checkout", "-q", "main");
    write(dir, "a1.txt", "v3\n");
    git(dir, "commit", "-aqm", "fix: 后来又改了一次");
    git(dir, "checkout", "-q", "-b", "late");
    stale(dir, ["a1.txt"]);
    // v1 是 c2 改它之前的内容；depth 为 1 时只看最近那次（v2 改成 v3），查不到
    expect(findRollbacks("main", "late", 1, dir)).toEqual([]);
    expect(findRollbacks("main", "late", 2, dir)).toHaveLength(1);
  });
});

describe("命令行", () => {
  const run = (cwd: string, title: string) =>
    spawnSync(process.execPath, [script, "--base", "main", "--head", "work", "--title", title], {
      cwd,
      encoding: "utf8",
    });

  it("坏样例退出码 1 并说明怎么办；同样的改动标题是 revert 则退出码 0", () => {
    const dir = repo();
    stale(dir);
    const bad = run(dir, "test(ci): 隔离测试");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("a1.txt");
    expect(bad.stderr).toContain("revert");
    expect(run(dir, "revert: 撤销别人的改动").status).toBe(0);
  });

  it("好样例退出码 0；缺参数退出码 2", () => {
    const dir = repo();
    write(dir, "a1.txt", "v3\n");
    git(dir, "commit", "-aqm", "feat: 正常改动");
    expect(run(dir, "feat: 正常改动").status).toBe(0);
    expect(
      spawnSync(process.execPath, [script, "--base", "main"], { encoding: "utf8" }).status,
    ).toBe(2);
  });
});
