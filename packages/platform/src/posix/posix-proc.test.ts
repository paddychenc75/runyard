import { describe, expect, it } from "vitest";
import { createPosixProc } from "./posix-proc.ts";
import type { ProcessEntry, ProcessSource } from "./process-source.ts";

// 用假进程表和假 kill 验证“认身份再发信号”的规则；真进程的行为在 contract/ 里。
// 假时钟：sleep 只推进时间，不真等。

// 本进程（代码里“绝不碰自己”比较的是真实的 process.pid）
const ME: ProcessEntry = { pid: process.pid, pgid: process.pid, startTime: 1 };

function setup(
  initial: ProcessEntry[],
  opts: { dies?: "on-term" | "on-kill" | "never"; withEnv?: ProcessEntry[] } = {},
) {
  let table = initial.some((e) => e.pid === ME.pid) ? initial : [ME, ...initial];
  let clock = 0;
  const calls: [number, string | number][] = [];
  const source: ProcessSource = {
    snapshot: async () => table,
    startTime: async (pid) => table.find((e) => e.pid === pid)?.startTime ?? null,
    startTimeSync: () => null,
    findByEnv: async () => opts.withEnv ?? [],
  };
  const proc = createPosixProc({
    source,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    kill: (pid, signal) => {
      calls.push([pid, signal]);
      if (signal === 0) {
        if (!table.some((e) => e.pgid === -pid))
          throw Object.assign(new Error("gone"), { code: "ESRCH" });
        return;
      }
      const dies = opts.dies ?? "on-term";
      if (dies === "on-term" || (dies === "on-kill" && signal === "SIGKILL")) {
        table = table.filter((e) => e.pgid !== -pid);
      }
    },
  });
  return { proc, calls, signals: () => calls.filter(([, s]) => s !== 0) };
}

const root = { pid: 100, pgid: 100, startTime: 50_000 };
const child = { pid: 101, pgid: 100, startTime: 50_100 };

describe("proc.terminate 的身份核对", () => {
  it("身份一致：对整组（负的组号）发终止信号", async () => {
    const { proc, signals } = setup([root, child]);
    await proc.terminate({ pid: 100, startTime: 50_000 }, { mode: "graceful", graceMs: 2000 });
    expect(signals()).toEqual([[-100, "SIGTERM"]]);
  });

  it("启动时间对不上（pid 被复用）：一个信号也不发", async () => {
    const { proc, calls } = setup([root, child]);
    await proc.terminate({ pid: 100, startTime: 49_000 }, { mode: "kill", graceMs: 0 });
    expect(calls).toEqual([]);
  });

  it("根进程不是组长：不发", async () => {
    const { proc, calls } = setup([{ pid: 100, pgid: 77, startTime: 50_000 }]);
    await proc.terminate({ pid: 100, startTime: 50_000 }, { mode: "kill", graceMs: 0 });
    expect(calls).toEqual([]);
  });

  it("危险的 pid（0、1、负数、非整数、本进程）一律不发，即使进程表里碰巧有", async () => {
    const entries: ProcessEntry[] = [
      { pid: 1, pgid: 1, startTime: 0 },
      { pid: 0, pgid: 0, startTime: 0 },
    ];
    const { proc, calls } = setup(entries);
    for (const pid of [0, 1, -1, -100, 1.5, Number.NaN, ME.pid]) {
      await proc.terminate({ pid, startTime: 0 }, { mode: "kill", graceMs: 0 });
      await proc.terminate({ pid, startTime: ME.startTime }, { mode: "kill", graceMs: 0 });
    }
    expect(calls).toEqual([]);
  });

  it("绝不碰自己所在的组，即使别的进程声称是它的组长", async () => {
    const { proc, calls } = setup([
      { pid: 7, pgid: 7, startTime: 10 },
      { ...ME, pgid: 7 },
    ]);
    await proc.terminate({ pid: 7, startTime: 10 }, { mode: "kill", graceMs: 0 });
    expect(calls).toEqual([]);
  });

  it("根进程已死、组里还有后代：后代都不早于根的启动时间才认", async () => {
    const orphan = setup([child]);
    await orphan.proc.terminate({ pid: 100, startTime: 50_000 }, { mode: "kill", graceMs: 0 });
    expect(orphan.signals()).toEqual([[-100, "SIGKILL"]]);

    const reused = setup([child]);
    await reused.proc.terminate({ pid: 100, startTime: 60_000 }, { mode: "kill", graceMs: 0 });
    expect(reused.calls).toEqual([]);
  });
});

describe("proc.terminate 的升级", () => {
  const ref = { pid: 100, startTime: 50_000 };

  it("graceful 等满 graceMs 后升级为对整组强制结束", async () => {
    const { proc, signals } = setup([root, child], { dies: "on-kill" });
    await proc.terminate(ref, { mode: "graceful", graceMs: 2000 });
    expect(signals()).toEqual([
      [-100, "SIGTERM"],
      [-100, "SIGKILL"],
    ]);
  });

  it("interrupt 发的是中断", async () => {
    const { proc, signals } = setup([root]);
    await proc.terminate(ref, { mode: "interrupt", graceMs: 2000 });
    expect(signals()).toEqual([[-100, "SIGINT"]]);
  });

  it("kill 直接强制结束，不发礼貌请求", async () => {
    const { proc, signals } = setup([root], { dies: "on-kill" });
    await proc.terminate(ref, { mode: "kill", graceMs: 2000 });
    expect(signals()).toEqual([[-100, "SIGKILL"]]);
  });

  it("强制结束之后组还不空：抛错，不假装停好了", async () => {
    const { proc } = setup([root], { dies: "never" });
    await expect(proc.terminate(ref, { mode: "kill", graceMs: 0 })).rejects.toMatchObject({
      error: { code: "INTERNAL" },
    });
  });

  it("members 只在身份对得上时返回组员，按 pid 排序", async () => {
    const { proc } = setup([child, root]);
    expect(await proc.members(ref)).toEqual([100, 101]);
    expect(await proc.members({ pid: 100, startTime: 1 })).toEqual([]);
  });
});

describe("proc.findByMarker", () => {
  it("[RUN-LIFECYCLE-20] 把进程表给出的命中原样换成 pid 加启动时间，按 pid 排序", async () => {
    const { proc } = setup([], {
      withEnv: [
        { pid: 300, pgid: 300, startTime: 70_000 },
        { pid: 200, pgid: 100, startTime: 60_000 },
      ],
    });
    expect(await proc.findByMarker({ name: "RUNYARD_RUN_ID", value: "run-1" })).toEqual([
      { pid: 200, startTime: 60_000 },
      { pid: 300, startTime: 70_000 },
    ]);
  });

  it("本进程、pid 0 和 1 不在结果里（结果会被拿去 terminate）", async () => {
    const { proc } = setup([], {
      withEnv: [
        ME,
        { pid: 1, pgid: 1, startTime: 0 },
        { pid: 0, pgid: 0, startTime: 0 },
        { pid: 400, pgid: 400, startTime: 80_000 },
      ],
    });
    expect(await proc.findByMarker({ name: "A", value: "b" })).toEqual([
      { pid: 400, startTime: 80_000 },
    ]);
  });
});
