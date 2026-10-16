import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type JobInfo, jobsToStatuses } from "./report-statuses.ts";

// 每个用例要起子进程（跑脚本或 git）；Windows 机器上子进程慢，默认 5 秒不够
vi.setConfig({ testTimeout: 60_000 });

const script = join(import.meta.dirname, "report-statuses.ts");
const job = (name: string, status: string, conclusion: string | null): JobInfo => ({
  name,
  status,
  conclusion,
  html_url: `https://example.test/${name}`,
});

describe("jobsToStatuses", () => {
  it("成功和被条件跳过的任务记成 success，名字原样作为 context", () => {
    const result = jobsToStatuses(
      [
        job("lint（格式、仓库检查、标题格式）", "completed", "success"),
        job("依赖变更审查", "completed", "skipped"),
      ],
      "回报",
    );
    expect(result.map((s) => [s.context, s.state])).toEqual([
      ["lint（格式、仓库检查、标题格式）", "success"],
      ["依赖变更审查", "success"],
    ]);
  });

  it("失败、取消、超时都不能记成功", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", null]) {
      const [status] = jobsToStatuses([job("test（macos-26）", "completed", conclusion)], "回报");
      expect(status?.state).toBe("failure");
    }
  });

  it("还没结束的任务记 pending", () => {
    const [status] = jobsToStatuses([job("test（macos-26）", "in_progress", null)], "回报");
    expect(status?.state).toBe("pending");
  });

  it("不给回报任务自己记状态", () => {
    const result = jobsToStatuses(
      [job("回报", "in_progress", null), job("a", "completed", "success")],
      "回报",
    );
    expect(result.map((s) => s.context)).toEqual(["a"]);
  });

  it("一个失败的任务不会被其他成功的任务掩盖", () => {
    const result = jobsToStatuses(
      [job("a", "completed", "success"), job("b", "completed", "failure")],
      "回报",
    );
    expect(result.find((s) => s.context === "b")?.state).toBe("failure");
  });
});

describe("命令行", () => {
  it("缺参数或运行编号不是数字：退出码 2", () => {
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(run().status).toBe(2);
    expect(run("--repo", "a/b", "--run-id", "x; rm", "--sha", "abc", "--self", "回报").status).toBe(
      2,
    );
  });
});
