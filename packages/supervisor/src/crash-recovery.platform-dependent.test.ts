import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import type { RunSnapshot } from "@runyard/protocol";
import { registerSpawned } from "@runyard/testing";
import { afterEach, beforeEach, expect, it } from "vitest";
import { composeExtensions } from "./compose-extensions.ts";
import { Pump } from "./library-harness.test.ts";
import { makeShortHome, waitUntil } from "./process-harness.test.ts";
import { runRecordsDir } from "./run-record-store.ts";
import { startSupervisor } from "./start-supervisor.ts";
import type { SupervisorHandle } from "./supervisor-options.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 真实进程：管理进程跑在测试进程里（真实平台、临时主目录），项目的服务是一个很小的 Node 脚本（监听端口并起一个孙进程）。
// 上一个管理进程的“崩溃”用只关掉监听、不停运行的方式做出来：子进程树和运行记录留下，锁放开——和被强杀之后磁盘上的样子一样。
// 每个起过的进程按 pid 加启动时间登记，结束时核对无遗留。绝不使用 ~/Runyard 和 ~/.runyard。

const server = `const net = require('node:net');
const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
net.createServer().listen(Number(process.argv[2]), '127.0.0.1');
setInterval(() => {}, 1000);
`;

let home: ReturnType<typeof makeShortHome>;
let data: string;
let base: Platform;
let platform: Platform;
const tracked: ProcRef[] = [];
const handles: SupervisorHandle[] = [];
const pumps: Pump[] = [];

beforeEach(() => {
  home = makeShortHome();
  data = realpathSync(mkdtempSync(join(tmpdir(), "ry-crash-")));
  base = getPlatform({ home: home.home, profile: undefined });
  platform = {
    ...base,
    exec: {
      ...base.exec,
      spawn: (spec) => {
        const child = base.exec.spawn(spec);
        tracked.push(child.ref);
        registerSpawned(base, child.ref);
        return child;
      },
    },
  };
  mkdirSync(join(data, "runners", "fake-server"), { recursive: true });
  mkdirSync(join(data, "tools"), { recursive: true });
  writeFileSync(
    join(data, "runners", "fake-server", "runner.json"),
    JSON.stringify({
      formatVersion: 1,
      id: "fake-server",
      kind: "server",
      needs: [],
      run: { command: [process.execPath, "{dir}/server.js", "{port}"] },
      ready: { port: {}, slowAfterMs: 30000 },
      preview: { type: "web" },
      watch: { mode: "none" },
      stop: { mode: "graceful", graceMs: 1000 },
    }),
  );
  const dir = join(base.paths.defaultLibrary, "cli-demo");
  mkdirSync(join(dir, ".runyard"), { recursive: true });
  writeFileSync(join(dir, "server.js"), server);
  writeFileSync(
    join(dir, ".runyard", "playground.json"),
    JSON.stringify({
      formatVersion: 1,
      id: "01CLI",
      template: { id: "fake", source: "builtin", appVersion: "0.0.0" },
      runner: "fake-server",
      requires: {},
      toolchainAtCreate: {},
      createdAt: 1,
      createdBy: { kind: "user" },
      autoClean: { enabled: false },
      trust: "trusted",
    }),
  );
});

afterEach(async () => {
  for (const pump of pumps.splice(0)) {
    pump.stop();
    pump.client.destroy();
  }
  for (const handle of handles.splice(0)) await handle.api.shutdown("user");
  const leaked = await aliveRefs();
  for (const ref of leaked) await base.proc.terminate(ref, { mode: "kill", graceMs: 0 });
  home.remove();
  rmSync(data, { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
  expect(leaked).toEqual([]);
});

async function aliveRefs(): Promise<ProcRef[]> {
  const alive: ProcRef[] = [];
  for (const ref of tracked) {
    if ((await base.proc.identity(ref.pid))?.startTime === ref.startTime) alive.push(ref);
  }
  return alive;
}

const identity = {
  protocol: 1,
  minClientProtocol: 1,
  version: "0.0.0-it",
  build: "0.0.0-it+crash",
  startedBy: "cli",
} as const;

async function startGeneration(crashOnShutdown: boolean): Promise<SupervisorHandle> {
  const templateData = {
    builtinDir: absPath(join(data, "builtin")),
    runnersDir: absPath(join(data, "runners")),
    toolsDir: absPath(join(data, "tools")),
  };
  const handle = await startSupervisor({
    platform,
    identity,
    templateData,
    host: "node",
    execPath: process.execPath,
    extend: (api) => {
      const { extensions } = composeExtensions(api, {
        templateData,
        appVersion: "0.0.0-it",
        log: () => undefined,
      });
      // 崩溃的管理进程不会来得及停运行：不给 onShutdown，运行记录和子进程树就原样留下
      return crashOnShutdown ? { ...extensions, onShutdown: undefined } : extensions;
    },
  });
  handles.push(handle);
  return handle;
}

async function open(handle: SupervisorHandle): Promise<Pump> {
  const client = await TestClient.connect(platform);
  await client.handshake(platform, tokenBytes(handle.token), { kind: "cli" });
  const pump = new Pump(client);
  pumps.push(pump);
  return pump;
}

it("[SUPERVISOR-LIFECYCLE-16] 管理进程崩溃后下次启动：残留的子进程树整棵结束，运行标为 crashed，端口可重新绑定，记录被清掉", async () => {
  const first = await startGeneration(true);
  const cli = await open(first);
  const run = await waitUntil(async () => {
    const response = await cli.call("run.start", {
      playground: "cli-demo",
      owner: { kind: "cli", command: "runyard run" },
      wait: "ready",
    });
    return response.ok === true
      ? (response.result as RunSnapshot & { pid: number; port: number })
      : undefined;
  }, "the run to be ready");
  const root = tracked.find((ref) => ref.pid === run.pid);
  if (root === undefined) throw new Error("run was not tracked");
  expect(await base.ports.isFree(run.port)).toBe("in-use");
  expect((await base.proc.members(root)).length).toBeGreaterThan(0);
  await waitUntil(
    async () => (readdirSync(runRecordsDir(base)).length > 0 ? true : undefined),
    "record",
  );
  cli.client.destroy();

  // “强杀”：监听关掉、锁放开，子进程树和记录留下
  await first.api.shutdown("user");
  expect(await base.ports.isFree(run.port)).toBe("in-use");
  expect(readdirSync(runRecordsDir(base))).toEqual([`${run.runId}.json`]);

  const second = await startGeneration(false);
  expect(await base.ports.isFree(run.port)).toBe("free");
  expect(await base.proc.members(root)).toEqual([]);
  expect((await base.proc.identity(root.pid))?.startTime === root.startTime).toBe(false);
  expect(readdirSync(runRecordsDir(base))).toEqual([]);
  const after = await open(second);
  expect((await after.result<RunSnapshot>("run.get", { runId: run.runId })).state).toBe("crashed");
}, 30_000);
