import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeReleaseNotes, readSummary, summaryPath } from "./release-summary.ts";

// 每个用例要起子进程（跑脚本或 git）；Windows 机器上子进程慢，默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const script = join(import.meta.dirname, "release-summary.ts");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "release-summary-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe("readSummary", () => {
  it("有说明文件：返回去掉首尾空白的正文", () => {
    const dir = tempRepo({ "docs/releases/0.1.0.md": "\n这个版本还不能用。\n\n" });
    expect(readSummary(dir, "0.1.0")).toEqual({ text: "这个版本还不能用。" });
  });

  it("缺文件：错误里写明路径和去哪看格式", () => {
    const dir = tempRepo({});
    const result = readSummary(dir, "0.2.0");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(summaryPath("0.2.0"));
    expect((result as { error: string }).error).toContain("docs/guides/release.md");
  });

  it("文件是空的：报错", () => {
    const dir = tempRepo({ "docs/releases/0.1.0.md": "  \n" });
    expect(readSummary(dir, "0.1.0")).toHaveProperty("error");
  });

  it("版本号带路径字符：拒绝，不去读别处的文件", () => {
    const dir = tempRepo({});
    expect(readSummary(dir, "../../x")).toHaveProperty("error");
  });
});

describe("composeReleaseNotes", () => {
  it("白话说明在前，更新日志在后，中间一条分隔线", () => {
    expect(composeReleaseNotes("说明\n", "## 0.1.0\n\n* a\n")).toBe(
      "说明\n\n---\n\n## 0.1.0\n\n* a\n",
    );
  });
});

describe("命令行", () => {
  const run = (cwd: string, ...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

  it("check 有说明：退出码 0；没有：退出码 1", () => {
    const dir = tempRepo({ "docs/releases/0.1.0.md": "说明" });
    expect(run(dir, "check", "--version", "0.1.0").status).toBe(0);
    expect(run(dir, "check", "--version", "0.2.0").status).toBe(1);
  });

  it("check 从清单文件读版本号", () => {
    const dir = tempRepo({
      "docs/releases/0.3.0.md": "说明",
      ".release-please-manifest.json": '{ ".": "0.3.0" }',
    });
    expect(run(dir, "check", "--manifest", ".release-please-manifest.json").status).toBe(0);
  });

  it("compose 打印说明加更新日志", () => {
    const dir = tempRepo({ "docs/releases/0.1.0.md": "说明", "body.md": "## 0.1.0\n" });
    const result = run(dir, "compose", "--version", "0.1.0", "--body-file", "body.md");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("说明\n\n---\n\n## 0.1.0\n");
  });

  it("参数不对：退出码 2", () => {
    expect(run(tmpdir(), "check").status).toBe(2);
    expect(run(tmpdir(), "oops", "--version", "0.1.0").status).toBe(2);
  });
});
