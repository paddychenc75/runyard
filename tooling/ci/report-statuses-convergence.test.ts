import { expect, it, vi } from "vitest";
import { main } from "./report-statuses.ts";

const SHA = "9d99ee5c73cc3c9875da4f004888dff26ae5ebee";
const args = ["--repo", "a/b", "--run-id", "123", "--sha", SHA, "--attempt", "1", "--self", "回报"];

// 所有等待使用假时钟；仅返回API快照，不启动产品或重跑上游测试。
function api(conclusions: (string | null)[], head = SHA, attempt = 1) {
  const posted: { state?: string; context?: string; target_url?: string }[] = [];
  let reads = 0;
  const request = vi.fn((command: string[]) => {
    if (command.includes("POST")) {
      const fields = Object.fromEntries(
        command
          .filter((_, index) => command[index - 1] === "-f")
          .map((field) => {
            const index = field.indexOf("=");
            return [field.slice(0, index), field.slice(index + 1)];
          }),
      );
      posted.push(fields);
      return "{}";
    }
    if (command.some((part) => part.includes("/jobs?"))) {
      const conclusion = conclusions[Math.min(reads++, conclusions.length - 1)] ?? null;
      // 两页响应，第二页是待收敛的mac任务，防止只读第一页后提早成功。
      return JSON.stringify([
        {
          jobs: [
            {
              name: "lint",
              status: "completed",
              conclusion: "success",
              html_url: "https://example.test/lint",
            },
          ],
        },
        {
          jobs: [
            {
              name: "mac",
              status: conclusion === null ? "queued" : "completed",
              conclusion,
              html_url: "https://example.test/mac",
            },
          ],
        },
      ]);
    }
    return JSON.stringify({ id: 123, head_sha: head, run_attempt: attempt });
  });
  return { request, posted, reads: () => reads };
}

async function report(fake: ReturnType<typeof api>) {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = Promise.resolve(main(args, fake.request));
    await vi.runAllTimersAsync();
    return await result;
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
}

it("#532 queued→success：读取全部页并等终态后回报，绑定本次attempt", async () => {
  const fake = api([null, "success"]);
  expect(await report(fake)).toBe(0);
  expect(fake.posted.find((status) => status.context === "mac")?.state).toBe("success");
  expect(
    fake.request.mock.calls.some(([command]) =>
      command.includes("repos/a/b/actions/runs/123/attempts/1/jobs?per_page=100"),
    ),
  ).toBe(true);
  expect(fake.reads()).toBeGreaterThan(1);
  expect(
    fake.request.mock.calls
      .filter(([command]) => command.some((part) => part.includes("/jobs?")))
      .every(([command]) => command.includes("--paginate") && command.includes("--slurp")),
  ).toBe(true);
});

it.each(["failure", "cancelled"])(
  "#532 queued→%s：不能把失败或取消改成成功",
  async (conclusion) => {
    const fake = api([null, conclusion]);
    await report(fake);
    expect(fake.posted.find((status) => status.context === "mac")).toMatchObject({
      state: "failure",
      target_url: "https://example.test/mac",
    });
  },
);

it("#532 一直queued：有限重读后保留pending并非零退出", async () => {
  const fake = api([null]);
  expect(await report(fake)).not.toBe(0);
  expect(fake.posted.find((status) => status.context === "mac")?.state).toBe("pending");
  expect(fake.reads()).toBeGreaterThan(1);
  expect(fake.reads()).toBeLessThanOrEqual(20);
});

it.each([
  ["wrong-head", 1],
  [SHA, 2],
] as const)("#532 SHA/attempt不匹配拒绝写入提交状态", async (head, attempt) => {
  const fake = api(["success"], head, attempt);
  expect(await report(fake)).not.toBe(0);
  expect(fake.posted).toEqual([]);
});

it("#532 查询终态后attempt已前进：旧运行不得写回提交状态", async () => {
  const fake = api(["success"]);
  const original = fake.request.getMockImplementation();
  if (!original) throw new Error("缺少API夹具");
  let metadataReads = 0;
  fake.request.mockImplementation((command) => {
    if (command.includes("repos/a/b/actions/runs/123"))
      return JSON.stringify({ id: 123, head_sha: SHA, run_attempt: ++metadataReads === 1 ? 1 : 2 });
    return original(command);
  });
  expect(await report(fake)).not.toBe(0);
  expect(fake.posted).toEqual([]);
});

it("#532 API没有返回前置任务，不能凭空回报成功", async () => {
  const fake = api(["success"]);
  const original = fake.request.getMockImplementation();
  if (!original) throw new Error("缺少API夹具");
  fake.request.mockImplementation((command) =>
    command.some((part) => part.includes("/jobs?"))
      ? JSON.stringify([{ jobs: [] }])
      : original(command),
  );
  expect(await report(fake)).not.toBe(0);
  expect(fake.posted).toEqual([]);
});
