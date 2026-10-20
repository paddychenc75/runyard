// 把“手动触发的运行”里每个任务的结果，原样记成提交状态（commit status），名字就是任务名。
// 为什么需要它（决策记录 0015）：发版 PR 由默认令牌开出，GitHub 不会为它跑 pull_request 工作流；
// release-please.yml 因此手动触发 ci.yml 和 security.yml（workflow_dispatch），但手动触发产生的“检查运行”
// 不会计入 PR 的合并条件（实测：PR 的检查汇总为空，合并状态一直是 BLOCKED）。提交状态按名字匹配，会计入，
// 所以由这些工作流的最后一个任务把真实结果同步成同名的提交状态。这里不判断也不修饰结果：任务失败就记失败。
//
// 用法（在 CI 里，需要 gh 和 GH_TOKEN）：
//   node tooling/ci/report-statuses.ts --repo <所有者/仓库> --run-id <运行编号> --attempt <次数> --sha <提交> --self <本任务的名字>
// 退出码：0 已记录全部终态；1 查询、记录失败或任务仍未终结；2 参数错误。

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
  return execFileSync("gh", args, { encoding: "utf8", input, timeout: 10_000 });
}

interface Selection {
  repo: string;
  runId: string;
  attempt: number;
  sha: string;
  self: string;
}
type Request = (args: string[]) => string;

function matchesRun(selected: Selection, request: Request): boolean {
  const run = JSON.parse(
    request(["api", `repos/${selected.repo}/actions/runs/${selected.runId}`]),
  ) as {
    id: number;
    head_sha: string;
    run_attempt: number;
  };
  if (
    String(run.id) === selected.runId &&
    run.head_sha === selected.sha &&
    run.run_attempt === selected.attempt
  )
    return true;
  console.error("运行编号、提交或attempt不匹配，停止回报；请核对工作流传入的当前运行信息。");
  return false;
}

async function settledStatuses(
  selected: Selection,
  request: Request,
): Promise<CommitStatus[] | null> {
  let statuses: CommitStatus[] = [];
  // #532：needs已结束仍可能读到滞后快照；只重读API，绝不重跑产品测试。
  for (let read = 0; read < 10; read += 1) {
    if (!matchesRun(selected, request)) return null;
    const raw = request([
      "api",
      "--paginate",
      "--slurp",
      `repos/${selected.repo}/actions/runs/${selected.runId}/attempts/${selected.attempt}/jobs?per_page=100`,
    ]);
    const pages = JSON.parse(raw) as { jobs: JobInfo[] }[];
    statuses = jobsToStatuses(
      pages.flatMap((page) => page.jobs),
      selected.self,
    );
    if (statuses.length > 0 && statuses.every((status) => status.state !== "pending")) break;
    if (read < 9) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return statuses;
}

async function report(selected: Selection, request: Request): Promise<number> {
  const statuses = await settledStatuses(selected, request);
  // 等待期间可能已经启动新attempt；旧回报不能覆盖新运行的状态。
  if (statuses === null || !matchesRun(selected, request)) return 1;
  for (const status of statuses) {
    request([
      "api",
      "--method",
      "POST",
      `repos/${selected.repo}/statuses/${selected.sha}`,
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
  if (statuses.length === 0 || statuses.some((status) => status.state === "pending")) {
    console.error(
      "任务结果在有限查询后仍未终结；保留pending，不将回报标为成功。请检查对应运行的API状态。",
    );
    return 1;
  }
  return 0;
}

export async function main(argv = process.argv.slice(2), request = gh): Promise<number> {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (
      !["--repo", "--run-id", "--sha", "--self", "--attempt"].includes(key ?? "") ||
      value === undefined
    ) {
      console.error(`参数错误：${key ?? ""}。用法见文件开头的说明。`);
      return 2;
    }
    values.set(key as string, value);
  }
  const repo = values.get("--repo");
  const runId = values.get("--run-id");
  const sha = values.get("--sha");
  const self = values.get("--self");
  const attempt = values.get("--attempt");
  if (
    !repo ||
    !runId ||
    !sha ||
    self === undefined ||
    !/^\d+$/.test(runId) ||
    !attempt ||
    !/^[1-9]\d*$/.test(attempt) ||
    !Number.isSafeInteger(Number(attempt))
  ) {
    console.error(
      "参数错误：--repo、--run-id（数字）、--attempt（正整数）、--sha、--self 都要给。",
    );
    return 2;
  }
  try {
    return await report({ repo, runId, sha, self, attempt: Number(attempt) }, request);
  } catch (error) {
    console.error(`查询或写入提交状态失败：${String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
