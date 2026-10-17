import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../path-types.ts";
import type { ProcRef } from "../platform.ts";
import type { ContractContext } from "./context.ts";
import { ProcessLedger } from "./process-ledger.ts";
import { eventually, freePort, startTree, WAIT_MS } from "./service-harness.ts";

// 重复起停的次数。技术验证 K2 每个系统做了 900 次；这里取 50（issue #25 原来的数）。
// 进程测试阶段里这个测试独占机器，实测 20 次在 CI 上约 4 到 6 秒，50 次约 10 到 16 秒（预算见 docs/guides/testing.md）
const REPEAT_CYCLES = 50;
// 停止之后端口必须在这个时间内能重新绑定（规格 RUN-LIFECYCLE-14，ADR 0006）
const REBIND_LIMIT_MS = 3000;
// “没有等 graceMs”类断言：graceMs 取得很长，用时上限取慢机器也够的值，两者之间仍然拉得开
const LONG_GRACE_MS = 60_000;
const SLOW_RUNNER_MS = 10_000;

const sorted = (pids: number[]) => [...pids].sort((a, b) => a - b);

// proc 的契约：用真进程树验证整棵停止、身份核对、已死的目标、组员查询。
export function procContract(ctx: ContractContext): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "runyard-proc-")));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const platform = ctx.create(root);
  const cwd = absPath(root);

  let ledger: ProcessLedger;
  beforeEach(() => {
    ledger = new ProcessLedger(platform);
  });
  afterEach(async () => {
    expect(await ledger.cleanup(), "测试结束时不应有进程遗留").toEqual([]);
  });

  /** 停止返回后，整棵树里没有一个活着的进程，组员为空 */
  async function expectGone(ref: ProcRef) {
    expect(await platform.proc.members(ref)).toEqual([]);
    expect(await ledger.survivors()).toEqual([]);
  }

  /** 端口在 limitMs 内能重新绑定；返回花了多久 */
  const rebind = (port: number, limitMs = REBIND_LIMIT_MS) =>
    eventually(
      async () => (await platform.ports.isFree(port)) === "free",
      limitMs,
      `端口 ${port} 可重新绑定`,
    );

  describe("proc.identity", () => {
    it("本进程有启动时间，两次查询一致", async () => {
      const first = await platform.proc.identity(process.pid);
      expect(first?.startTime).toBeGreaterThan(0);
      expect(await platform.proc.identity(process.pid)).toEqual(first);
    });

    it("不存在的进程返回 null", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 50 }, cwd);
      await tree.proc.exited;
      await eventually(
        async () => (await platform.proc.identity(tree.proc.ref.pid)) === null,
        WAIT_MS,
        "进程消失",
      );
    });

    it("新进程的启动时间不早于父进程", async () => {
      const parent = await platform.proc.identity(process.pid);
      const tree = await startTree(platform, ledger, {}, cwd);
      expect(tree.proc.ref.startTime).toBeGreaterThanOrEqual(
        parent?.startTime ?? Number.POSITIVE_INFINITY,
      );
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
    });
  });

  describe("proc.members", () => {
    it("列出根进程和所有后代，其他进程（比如测试进程自己）不在其中", async () => {
      const tree = await startTree(platform, ledger, { children: [{ children: [{}] }, {}] }, cwd);
      const members = await platform.proc.members(tree.proc.ref);
      expect(members).toEqual(sorted(tree.pids));
      expect(members).not.toContain(process.pid);
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      await expectGone(tree.proc.ref);
    });

    it("启动时间对不上（pid 被别的进程用了）时什么也不返回", async () => {
      const tree = await startTree(platform, ledger, { children: [{}] }, cwd);
      const stale = { pid: tree.proc.ref.pid, startTime: tree.proc.ref.startTime + 60_000 };
      expect(await platform.proc.members(stale)).toEqual([]);
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
    });

    it("根进程先退出、后代还活着时，后代仍算这一组的成员", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 100, children: [{}] }, cwd);
      await tree.proc.exited;
      const [rootPid, childPid] = tree.pids;
      const members = await platform.proc.members(tree.proc.ref);
      expect(members).toEqual([childPid]);
      expect(members).not.toContain(rootPid);
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
    });

    it("根进程已退出时，启动时间比后代还晚的 ref 不认", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 100, children: [{}] }, cwd);
      await tree.proc.exited;
      const later = { pid: tree.proc.ref.pid, startTime: tree.proc.ref.startTime + 60_000 };
      expect(await platform.proc.members(later)).toEqual([]);
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
    });
  });

  describe("proc.terminalMembers", () => {
    it("没有控制终端的进程（不是终端会话首进程）返回空数组；pid 对不上、进程已退出也一样", async () => {
      const tree = await startTree(platform, ledger, { children: [{}] }, cwd);
      expect(await platform.proc.terminalMembers(tree.proc.ref)).toEqual([]);
      const wrongTime = { pid: tree.proc.ref.pid, startTime: tree.proc.ref.startTime + 60_000 };
      expect(await platform.proc.terminalMembers(wrongTime)).toEqual([]);
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
      expect(await platform.proc.terminalMembers(tree.proc.ref)).toEqual([]);
    });
  });

  describe("proc.findByMarker", () => {
    const marker = () => ({ name: "RUNYARD_CONTRACT_MARKER", value: randomUUID() });
    const environment = (m: { name: string; value: string }) => ({ [m.name]: m.value });
    const byPid = (refs: ProcRef[]) => sorted(refs.map((ref) => ref.pid));

    it("[RUN-LIFECYCLE-20] 找得到脱离进程组的后代；先停整棵树后它还活着，按身份结束它之后找不到了", async () => {
      const m = marker();
      const tree = await startTree(
        platform,
        ledger,
        { children: [{ detached: true, children: [{}] }, {}] },
        cwd,
        environment(m),
      );
      // 根、同组的一个后代、脱离的后代、脱离后代的子进程
      expect(tree.pids).toHaveLength(4);
      const found = await platform.proc.findByMarker(m);
      expect(byPid(found)).toEqual(sorted(tree.pids));
      for (const ref of found) {
        expect(await platform.proc.identity(ref.pid), `pid ${ref.pid} 的启动时间`).toEqual({
          startTime: ref.startTime,
        });
      }

      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      expect(await platform.proc.members(tree.proc.ref)).toEqual([]);
      // 脱离的那一组（两个进程）不在原来的组里，停整棵树碰不到它们，只有按标记才找得到
      const strays = await platform.proc.findByMarker(m);
      expect(strays).toHaveLength(2);
      for (const stray of strays) {
        await platform.proc.terminate(stray, { mode: "kill", graceMs: 0 });
      }
      expect(await platform.proc.findByMarker(m)).toEqual([]);
      await expectGone(tree.proc.ref);
    });

    it("标记的值不同就找不到；没有任何进程带它时返回空数组", async () => {
      const m = marker();
      const tree = await startTree(platform, ledger, { children: [{}] }, cwd, environment(m));
      expect(await platform.proc.findByMarker({ ...m, value: `${m.value}x` })).toEqual([]);
      expect(
        await platform.proc.findByMarker({ name: m.name, value: m.value.slice(0, -1) }),
      ).toEqual([]);
      expect(await platform.proc.findByMarker({ ...m, name: `${m.name}_OTHER` })).toEqual([]);
      expect(byPid(await platform.proc.findByMarker(m))).toEqual(sorted(tree.pids));
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      expect(await platform.proc.findByMarker(m)).toEqual([]);
    });

    it("不会返回本进程，也不会返回 pid 0 和 1", async () => {
      const found = await platform.proc.findByMarker({
        name: "PATH",
        value: process.env.PATH ?? "",
      });
      expect(found.map((ref) => ref.pid)).not.toContain(process.pid);
      expect(found.every((ref) => ref.pid > 1)).toBe(true);
    });
  });

  describe("proc.terminate", () => {
    it("[RUN-LIFECYCLE-14] 停止有子孙进程的服务：整棵树没有活着的，3 秒内端口可重新绑定", async () => {
      const port = await freePort();
      const tree = await startTree(
        platform,
        ledger,
        { listen: port, children: [{ children: [{}] }, {}] },
        cwd,
      );
      expect(await platform.ports.isFree(port)).toBe("in-use");
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      await expectGone(tree.proc.ref);
      await rebind(port);
    });

    it("[RUN-LIFECYCLE-15] 进程忽略终止请求：等满 graceMs 后强制结束整棵树", async () => {
      const graceMs = 2000;
      const tree = await startTree(
        platform,
        ledger,
        { ignoreTerm: true, children: [{ ignoreTerm: true, children: [{ ignoreTerm: true }] }] },
        cwd,
      );
      const started = performance.now();
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs });
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(graceMs - 5);
      expect(elapsed).toBeLessThan(graceMs + SLOW_RUNNER_MS);
      await expectGone(tree.proc.ref);
      // 被强制结束，没有退出码
      expect(await tree.proc.exited).toEqual({ exitCode: null });
    });

    it("[RUN-LIFECYCLE-16] 根进程已退出、后代拿着输出管道不放：stop 在树为空后返回，不等管道关闭", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 100, children: [{}] }, cwd);
      await tree.proc.exited;
      expect(tree.proc.stdout.readableEnded).toBe(false);
      const started = performance.now();
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: LONG_GRACE_MS });
      expect(performance.now() - started).toBeLessThan(SLOW_RUNNER_MS);
      await expectGone(tree.proc.ref);
    });

    it("Go 型进程只响应中断：interrupt 让它自己干净退出，不走强制结束", async () => {
      const tree = await startTree(platform, ledger, { exitOnInterrupt: true }, cwd);
      const started = performance.now();
      await platform.proc.terminate(tree.proc.ref, { mode: "interrupt", graceMs: LONG_GRACE_MS });
      expect(performance.now() - started).toBeLessThan(SLOW_RUNNER_MS);
      expect(await tree.proc.exited).toEqual({ exitCode: 0 });
      await expectGone(tree.proc.ref);
    });

    it("Go 型进程收到 graceful 请求会忽略，要等到 graceMs 后被强制结束（所以运行器要声明 interrupt）", async () => {
      const tree = await startTree(platform, ledger, { exitOnInterrupt: true }, cwd);
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 300 });
      expect(await tree.proc.exited).toEqual({ exitCode: null });
      await expectGone(tree.proc.ref);
    });

    it("kill 模式立刻强制结束整棵树，不等 graceMs", async () => {
      const tree = await startTree(
        platform,
        ledger,
        { ignoreTerm: true, ignoreInterrupt: true, children: [{ ignoreTerm: true }] },
        cwd,
      );
      const started = performance.now();
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: LONG_GRACE_MS });
      expect(performance.now() - started).toBeLessThan(SLOW_RUNNER_MS);
      await expectGone(tree.proc.ref);
    });

    it("pid 被复用（启动时间对不上）：什么也不做，真正的进程树毫发无损", async () => {
      const tree = await startTree(platform, ledger, { children: [{}] }, cwd);
      const reused = { pid: tree.proc.ref.pid, startTime: tree.proc.ref.startTime + 60_000 };
      await platform.proc.terminate(reused, { mode: "kill", graceMs: 0 });
      await platform.proc.terminate(reused, { mode: "graceful", graceMs: 100 });
      expect(await ledger.survivors()).toHaveLength(2);
      expect(await platform.proc.members(tree.proc.ref)).toEqual(sorted(tree.pids));
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      await expectGone(tree.proc.ref);
    });

    it("根进程先退出、后代还活着：仍然整组停止", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 100, children: [{}] }, cwd);
      await tree.proc.exited;
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      await expectGone(tree.proc.ref);
    });

    it("目标已经死了：直接返回，不报错", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 50 }, cwd);
      await tree.proc.exited;
      await eventually(
        async () => (await platform.proc.identity(tree.proc.ref.pid)) === null,
        WAIT_MS,
        "进程消失",
      );
      await expect(
        platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 }),
      ).resolves.toBeUndefined();
    });

    it("停止途中进程自己退出：不报错，树为空", async () => {
      const tree = await startTree(platform, ledger, { exitAfterMs: 20, children: [{}] }, cwd);
      await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
      await expectGone(tree.proc.ref);
    });

    it("同一棵树同时被停两次：都正常返回", async () => {
      const tree = await startTree(platform, ledger, { children: [{}] }, cwd);
      await Promise.all([
        platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 }),
        platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 }),
      ]);
      await expectGone(tree.proc.ref);
    });

    it("绝不碰测试进程自己，即使拿到的是它真实的身份", async () => {
      const self = await platform.proc.identity(process.pid);
      const ref = { pid: process.pid, startTime: self?.startTime ?? 0 };
      expect(await platform.proc.members(ref)).toEqual([]);
      await platform.proc.terminate(ref, { mode: "graceful", graceMs: 50 });
      expect(await platform.proc.identity(process.pid)).toEqual(self);
    });

    it(`重复起停 ${REPEAT_CYCLES} 次：每次整棵树停净，3 秒内端口可重新绑定`, async () => {
      const rebinds: number[] = [];
      const stops: number[] = [];
      for (let cycle = 0; cycle < REPEAT_CYCLES; cycle += 1) {
        const port = await freePort();
        const tree = await startTree(
          platform,
          ledger,
          { listen: port, children: [{ children: [{}] }] },
          cwd,
        );
        const started = performance.now();
        await platform.proc.terminate(tree.proc.ref, { mode: "graceful", graceMs: 2000 });
        stops.push(performance.now() - started);
        rebinds.push(await rebind(port));
        expect(await platform.proc.members(tree.proc.ref)).toEqual([]);
        expect(await ledger.survivors(), `第 ${cycle + 1} 次`).toEqual([]);
      }
      const pct = (values: number[], q: number) =>
        [...values].sort((a, b) => a - b)[
          Math.min(values.length - 1, Math.floor(values.length * q))
        ] ?? 0;
      console.info(
        `[${ctx.name}] ${REPEAT_CYCLES} 次起停：停止耗时 中位 ${pct(stops, 0.5).toFixed(0)} / p95 ${pct(stops, 0.95).toFixed(0)} / 最大 ${Math.max(...stops).toFixed(0)} ms；` +
          `停止返回后端口可重绑 中位 ${pct(rebinds, 0.5).toFixed(0)} / 最大 ${Math.max(...rebinds).toFixed(0)} ms`,
      );
      expect(Math.max(...rebinds)).toBeLessThan(REBIND_LIMIT_MS);
    });
  });
}
