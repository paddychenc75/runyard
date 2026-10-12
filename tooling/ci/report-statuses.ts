// 把“手动触发的运行”里每个任务的结果，原样记成提交状态（commit status），名字就是任务名。
// 为什么需要它（决策记录 0015）：发版 PR 由默认令牌开出，GitHub 不会为它跑 pull_request 工作流；
// release-please.yml 因此手动触发 ci.yml 和 security.yml（workflow_dispatch），但手动触发产生的“检查运行”
// 不会计入 PR 的合并条件（实测：PR 的检查汇总为空，合并状态一直是 BLOCKED）。提交状态按名字匹配，会计入，
// 所以由这些工作流的最后一个任务把真实结果同步成同名的提交状态。这里不判断也不修饰结果：任务失败就记失败。
//
// 用法（在 CI 里，需要 gh 和 GH_TOKEN）：
//   node tooling/ci/report-statuses.ts --repo <所有者/仓库> --run-id <运行编号> --sha <提交> --self <本任务的名字>
// 退出码：0 已记录；1 查询或记录失败；2 参数错误。

import { execFileSync } from "node:child_process";

export interface JobInfo {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export interface CommitStatus {
  context: string;
  state: "success" | "failure" | "pending";
  description: string;
  target_url: string;
}

// 成功和“按条件跳过”算成功（和 GitHub 对必过检查的处理一致）；还没结束算 pending；其余都算失败
export function jobsToStatuses(jobs: JobInfo[], selfName: string): CommitStatus[] {
  return jobs
    .filter((job) => job.name !== selfName)
    .map((job) => {
      let state: CommitStatus["state"] = "failure";
      if (job.status !== "completed") state = "pending";
      else if (job.conclusion === "success" || job.conclusion === "skipped") state = "success";
      return {
        context: job.name,
        state,
        description: `手动触发的运行里这个任务的结果：${job.conclusion ?? job.status}`,
        target_url: job.html_url,
      };
    });
}

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, { encoding: "utf8", input });
}

function main(): number {
  const argv = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--repo", "--run-id", "--sha", "--self"].includes(key ?? "") || value === undefined) {
      console.error(`参数错误：${key ?? ""}。用法见文件开头的说明。`);
      return 2;
    }
    values.set(key as string, value);
  }
  const repo = values.get("--repo");
  const runId = values.get("--run-id");
  const sha = values.get("--sha");
  const self = values.get("--self");
  if (!repo || !runId || !sha || self === undefined || !/^\d+$/.test(runId)) {
    console.error("参数错误：--repo、--run-id（数字）、--sha、--self 都要给。");
    return 2;
  }
  const raw = gh([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`,
  ]);
  const pages = JSON.parse(raw) as { jobs: JobInfo[] }[];
  const jobs = pages.flatMap((page) => page.jobs);
  const statuses = jobsToStatuses(jobs, self);
  for (const status of statuses) {
    gh([
      "api",
      "--method",
      "POST",
      `repos/${repo}/statuses/${sha}`,
      "-f",
      `state=${status.state}`,
      "-f",
      `context=${status.context}`,
      "-f",
      `description=${status.description}`,
      "-f",
      `target_url=${status.target_url}`,
    ]);
    console.log(`${status.state}  ${status.context}`);
  }
  return 0;
}

if (import.meta.main) process.exit(main());
