import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import type { RunSnapshot } from "@runyard/protocol";
import { registerSpawned } from "@runyard/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pump } from "./library-harness.test.ts";
import { makeShortHome, waitUntil } from "./process-harness.test.ts";
import { createRunModule } from "./run-module.ts";
import { startSupervisor } from "./start-supervisor.ts";
import type { SupervisorHandle } from "./supervisor-options.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 真实进程：管理进程跑在测试进程里（真实平台、真实时钟、临时主目录），项目的服务是一个很小的 Node 脚本
// （监听端口并起一个孙进程）。验证单元测试里假平台、假时间看不出的东西：真实的 5 秒宽限期、整棵进程树消失、端口释放。
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
let handle: SupervisorHandle;
const tracked: ProcRef[] = [];
const pumps: Pump[] = [];

function seed(name: string, id: string): void {
  const dir = join(base.paths.defaultLibrary, name);
  mkdirSync(join(dir, ".runyard"), { recursive: true });
  writeFileSync(join(dir, "server.js"), server);
  writeFileSync(
    join(dir, ".runyard", "playground.json"),
    JSON.stringify({
      formatVersion: 1,
      id,
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
}

beforeEach(async () => {
  home = makeShortHome();
  data = realpathSync(mkdtempSync(join(tmpdir(), "ry-tpl-")));
  base = getPlatform({ home: home.home, profile: undefined });
  // 经平台层起的每个项目进程都登记（pid 加启动时间）
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
  seed("tab-demo", "01TAB");
  seed("cli-demo", "01CLI");
  const templateData = {
    builtinDir: absPath(join(data, "builtin")),
    runnersDir: absPath(join(data, "runners")),
    toolsDir: absPath(join(data, "tools")),
  };
  handle = await startSupervisor({
    platform,
    identity: {
      protocol: 1,
      minClientProtocol: 1,
      version: "0.0.0-it",
      build: "0.0.0-it+run",
      startedBy: "cli",
    },
    templateData,
    host: "node",
    execPath: process.execPath,
    extend: (api) => createRunModule(api, { templateData }),
  });
});

afterEach(async () => {
  for (const pump of pumps.splice(0)) {
    pump.stop();
    pump.client.destroy();
  }
  const stopper = await TestClient.connect(platform);
  await stopper.handshake(platform, tokenBytes(handle.token));
  stopper.send("run.stopAll", {});
  await waitUntil(async () => ((await aliveRefs()).length === 0 ? true : undefined), "all stopped");
  stopper.destroy();
  await handle.api.shutdown("user");
  const leaked = await aliveRefs();
  for (const ref of leaked) {
    await base.proc.terminate(ref, { mode: "kill", graceMs: 0 });
  }
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

async function open(kind: "app" | "cli"): Promise<Pump> {
  const client = await TestClient.connect(platform);
  await client.handshake(platform, tokenBytes(handle.token), { kind });
  const pump = new Pump(client);
  pumps.push(pump);
  return pump;
}

async function startReady(
  pump: Pump,
  playground: string,
  owner: unknown,
): Promise<RunSnapshot & { pid: number; port: number }> {
  // 启动时的资源库扫描不挡着接受连接，所以第一次请求可能还找不到项目
  return waitUntil(async () => {
    const response = await pump.call("run.start", { playground, owner, wait: "ready" });
    return response.ok === true
      ? (response.result as RunSnapshot & { pid: number; port: number })
      : undefined;
  }, `${playground} ready`);
}

const alive = async (ref: ProcRef) =>
  (await base.proc.identity(ref.pid))?.startTime === ref.startTime;

describe("真实进程：运行与持有者", () => {
  it("[RUN-OWNERSHIP-07] 应用被强杀：标签页持有的运行在断开 5 秒之后停止（整棵树、端口释放），命令行持有的继续", async () => {
    const app = await open("app");
    const cli = await open("cli");
    const tab = await startReady(app, "tab-demo", { kind: "tab", clientId: "app-1", tabId: "t1" });
    const other = await startReady(cli, "cli-demo", { kind: "cli", command: "runyard run" });
    const tabRoot = tracked.find((ref) => ref.pid === tab.pid);
    if (tabRoot === undefined) throw new Error("tab run was not tracked");
    expect(await base.ports.isFree(tab.port)).toBe("in-use");

    const killedAt = Date.now();
    app.client.destroy(); // 模拟应用进程被强杀：连接直接断开
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await alive(tabRoot)).toBe(true);
    await waitUntil(async () => ((await alive(tabRoot)) ? undefined : true), "the tab run to stop");
    expect(Date.now() - killedAt).toBeGreaterThanOrEqual(5000);
    expect(await base.proc.members(tabRoot)).toEqual([]);
    expect(await base.ports.isFree(tab.port)).toBe("free");

    const kept = await cli.result<RunSnapshot>("run.get", { runId: other.runId });
    expect(kept.state).toBe("ready");
    expect(await base.ports.isFree(other.port)).toBe("in-use");
  }, 30_000);

  it("[RUN-OWNERSHIP-06] session.bye：这条连接名下的运行在返回前停止，命令行持有的继续", async () => {
    const app = await open("app");
    const cli = await open("cli");
    const tab = await startReady(app, "tab-demo", { kind: "tab", clientId: "app-1", tabId: "t1" });
    const other = await startReady(cli, "cli-demo", { kind: "cli", command: "runyard run" });
    const tabRoot = tracked.find((ref) => ref.pid === tab.pid);
    if (tabRoot === undefined) throw new Error("tab run was not tracked");

    const started = Date.now();
    await app.result("session.bye", {});
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await alive(tabRoot)).toBe(false);
    expect(await base.proc.members(tabRoot)).toEqual([]);
    expect((await cli.result<RunSnapshot>("run.get", { runId: other.runId })).state).toBe("ready");
  }, 30_000);
});
