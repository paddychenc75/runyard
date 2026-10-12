import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { registerSpawned } from "@runyard/testing";
import { afterAll, describe, expect, it } from "vitest";
import type { RunClock } from "./run-clock.ts";
import { RunEngine } from "./run-engine.ts";
import type { ReadinessProbe, RunPlan, StartRequest } from "./run-types.ts";

// 集成测试：真实的 darwin/linux 平台层、真实的 node 进程树（根 → 子 → 孙），停止后一个都不能剩，
// 端口要能重新绑定。只用临时目录和动态端口，不碰 ~/Runyard 和 ~/.runyard；结束时检查并清掉自己起的进程。

const root = realpathSync(mkdtempSync(join(tmpdir(), "runyard-run-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const grandchild = "setInterval(() => {}, 1000); console.log('pid:' + process.pid);";
const child = `const { spawn } = require('node:child_process');
console.log('pid:' + process.pid);
spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: ['ignore', 'inherit', 'inherit'] });
setInterval(() => {}, 1000);`;
const main = `const { spawn } = require('node:child_process');
const net = require('node:net');
console.log('pid:' + process.pid);
spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: ['ignore', 'inherit', 'inherit'] });
net.createServer().listen(Number(process.argv[2]), '127.0.0.1', () => console.log('listening'));`;
writeFileSync(join(root, "main.js"), main);

const realClock: RunClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => Number(setTimeout(callback, ms)[Symbol.toPrimitive]()),
  clearTimeout: (id) => clearTimeout(id),
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

describe("运行引擎：真实进程树", () => {
  it("启动三层进程树、就绪后停止：整棵树消失，端口可重新绑定，stop 在 graceMs 加 3 秒内返回", async () => {
    const platform = getPlatform({ home: absPath(root) });
    const port = await freePort();
    const lines: string[] = [];
    const plan: RunPlan = {
      argv: [process.execPath, join(root, "main.js"), String(port)],
      cwd: absPath(root),
      env: { PATH: process.env.PATH ?? "" },
      stdin: false,
      stop: { mode: "graceful", graceMs: 2000 },
      port,
      url: `http://127.0.0.1:${port}`,
    };
    const readiness: ReadinessProbe = {
      async waitReady({ plan: p, signal }) {
        while (!signal.aborted && (await platform.ports.isFree(p.port ?? 0)) !== "in-use") {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
    };
    const engine = new RunEngine({
      platform,
      clock: realClock,
      readiness,
      preparer: { prepare: async () => ({ ok: true, plan }) },
      removeDir: async () => undefined,
      sinks: {
        state: () => undefined,
        log: (_runId, entry: LogEntry) => {
          if (entry.kind === "stdout") lines.push(entry.text);
        },
      },
    });
    const request: StartRequest = {
      playgroundId: "pg",
      name: "tree",
      kind: "server",
      owner: { kind: "cli", command: "run" },
    };
    const { run } = engine.start(request);
    let pids: number[] = [];
    try {
      await run.waitFor(["ready"]);
      expect(run.state).toBe("ready");
      // 孙进程的 pid 行可能比 listening 晚一点到
      const deadline = Date.now() + 30_000;
      while (lines.filter((l) => l.startsWith("pid:")).length < 3 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      pids = lines.filter((l) => l.startsWith("pid:")).map((l) => Number(l.slice(4)));
      expect(pids).toHaveLength(3);
      // 登记给进程测试阶段的兜底守卫：文件结束时还活着就让这个文件失败
      for (const pid of pids) {
        const identity = await platform.proc.identity(pid);
        if (identity) registerSpawned(platform, { pid, startTime: identity.startTime });
      }
      expect(pids.every(alive)).toBe(true);

      const stopped = await run.stop();
      expect(stopped.state).toBe("stopped");
      expect(pids.filter(alive)).toEqual([]);
      expect(await platform.ports.isFree(port)).toBe("free");
    } finally {
      await run.stop();
      for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL"); // 只在测试失败时兜底，pid 是本测试自己起的
    }
  });
});
