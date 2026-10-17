import { unlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import {
  type AbsPath,
  absPath,
  discoveryFilePath,
  type ManagedProcess,
  supervisorLogPath,
} from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isClientError } from "./client-error.ts";
import { connectSupervisor } from "./connect-supervisor.ts";
import {
  makeShortHome,
  recordingClock,
  SUPERVISOR_ENTRY,
  Tracked,
  waitUntil,
} from "./process-harness.test.ts";
import type { RunyardClient } from "./runyard-client.ts";

// 用真正的管理进程入口（单独的 Node 进程）跑客户端，在临时主目录里（绝不碰 ~/.runyard）。
// 每个起过的进程按 pid 加启动时间记账；每个测试结束时核对：没有遗留进程，没有监听者，发现文件已清。

let home: AbsPath;
let removeHome: () => void;
let tracked: Tracked;
const clients: RunyardClient[] = [];
const servers: Server[] = [];
const launchers: ManagedProcess[] = [];
// 测试自己负责结束的进程（强杀类测试）：结束后不再要求发现文件被清
let expectStaleFiles = false;

beforeEach(() => {
  const made = makeShortHome();
  home = made.home;
  removeHome = made.remove;
  tracked = new Tracked(home);
  expectStaleFiles = false;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) server.close();
  for (const launcher of launchers.splice(0)) {
    await tracked.platform.proc.terminate(launcher.ref, { mode: "kill", graceMs: 0 });
  }
  const leaked = await tracked.reap();
  removeHome();
  expect(leaked).toEqual([]);
});

async function connect(build = "0.0.0-it+one", overrides = {}): Promise<RunyardClient> {
  const client = await connectSupervisor(tracked.options(build, overrides));
  clients.push(client);
  return client;
}

describe("真实管理进程：启动与连接", () => {
  it("[SUPERVISOR-LIFECYCLE-07] 没有管理进程时命令行拉起它并完成请求；客户端断开后管理进程仍在，下一次连接直接用它", async () => {
    const client = await connect();
    expect(client.launched).toBe(true);
    expect(client.outcome).toEqual({ kind: "current" });
    expect(client.supervisor).toMatchObject({ startedBy: "cli", version: "0.0.0-it", runs: 0 });
    await expect(client.call("ping", {})).resolves.toEqual({});
    const ref = await tracked.current();
    // 日志写到状态目录下，拉起它的进程是通过平台层的 spawnDetached
    expect(
      await tracked.platform.fs.exists(supervisorLogPath(tracked.platform.paths.stateDir)),
    ).toBe(true);

    client.close();
    await client.closed;
    expect(await tracked.isAlive(ref)).toBe(true);
    const again = await connect();
    expect(again.launched).toBe(false);
    expect(again.outcome).toEqual({ kind: "current" });
    expect((await tracked.current()).pid).toBe(ref.pid);
    await tracked.stop(again, ref);
    await tracked.assertNothingLeft();
  });

  it("[SUPERVISOR-LIFECYCLE-01] 几个客户端同时发现没有管理进程并各自拉起：最终只有一个存活，连上的是同一个", async () => {
    const all = await Promise.all([connect(), connect(), connect(), connect()]);
    const pids = new Set<number>();
    for (const client of all) {
      expect(await client.call("ping", {})).toEqual({});
      pids.add(client.supervisor.runs === 0 ? (await tracked.current()).pid : -1);
    }
    expect(pids.size).toBe(1);
    // 落选的启动者自己退出；等它们退完，只剩赢家
    const winner = await tracked.current();
    await waitUntil(
      async () => ((await tracked.alive()).length === 1 ? true : undefined),
      "losers to exit",
    );
    expect((await tracked.alive())[0]?.pid).toBe(winner.pid);
    await tracked.stop(all[0] as RunyardClient, winner);
    await tracked.assertNothingLeft();
  });

  it("[SUPERVISOR-LIFECYCLE-10] 管理进程还没开始监听时连接失败：按退避重试，在上限之前连上", async () => {
    const clock = recordingClock();
    const client = await connect("0.0.0-it+one", { clock });
    expect(client.launched).toBe(true);
    // 进程启动需要时间，第一次连接一定失败，至少睡过一次；每次睡眠都是 50/100/200 之一
    expect(clock.sleeps.length).toBeGreaterThan(0);
    for (const ms of clock.sleeps) expect([50, 100, 200]).toContain(ms);
    await tracked.stop(client, await tracked.current());
    await tracked.assertNothingLeft();
  });

  it("[SUPERVISOR-LIFECYCLE-08] 启动者被强杀：管理进程仍然存活，之后的客户端照常连上", async () => {
    const launcher = tracked.platform.exec.spawn({
      argv: [
        process.execPath,
        new URL("./launch-and-hold.fixture.ts", import.meta.url).pathname,
        home,
        "0.0.0-it+one",
        SUPERVISOR_ENTRY,
      ],
      cwd: home,
      env: {},
      stdin: false,
    });
    registerSpawned(tracked.platform, launcher.ref);
    launchers.push(launcher);
    let output = "";
    launcher.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    launcher.stderr.resume();
    await waitUntil(
      () => (output.includes("connected true") ? true : undefined),
      "the launcher to connect",
    );
    const supervisor = await tracked.current();

    // 强杀启动者所在的整棵进程树
    await tracked.platform.proc.terminate(launcher.ref, { mode: "kill", graceMs: 0 });
    await launcher.exited;
    expect(await tracked.isAlive(supervisor)).toBe(true);

    const client = await connect();
    expect(client.launched).toBe(false);
    expect((await tracked.current()).pid).toBe(supervisor.pid);
    await tracked.stop(client, supervisor);
    await tracked.assertNothingLeft();
  });
});

describe("真实管理进程：版本表", () => {
  it("[PROTOCOL-HANDSHAKE-07] 协议版本和构建标识都相同：直接使用同一个管理进程", async () => {
    const first = await connect("0.0.0-it+same");
    const ref = await tracked.current();
    const second = await connect("0.0.0-it+same");
    expect(second.outcome).toEqual({ kind: "current" });
    expect(second.launched).toBe(false);
    expect((await tracked.current()).pid).toBe(ref.pid);
    first.close();
    await tracked.stop(second, ref);
    await tracked.assertNothingLeft();
  });

  it("[PROTOCOL-HANDSHAKE-08] 构建标识不同且没有运行：旧的退出，换成自己带的，旧进程不再存活", async () => {
    const old = await connect("0.0.0-it+old");
    const oldRef = await tracked.current();
    old.close();

    const fresh = await connect("0.0.0-it+new");
    expect(fresh.outcome).toEqual({ kind: "replaced" });
    expect(fresh.supervisor.build).toBe("0.0.0-it+new");
    expect(fresh.launched).toBe(true);
    const newRef = await tracked.current();
    expect(newRef.pid).not.toBe(oldRef.pid);
    expect(await tracked.isAlive(oldRef)).toBe(false);
    await tracked.stop(fresh, newRef);
    await tracked.assertNothingLeft();
  });

  it("[PROTOCOL-HANDSHAKE-11] 管理进程协议较旧且没有运行：换成自己带的；拉起来的仍旧不是更新的也不再换，照用", async () => {
    const old = await connect("0.0.0-it+one");
    const oldRef = await tracked.current();
    old.close();
    const client = await connect("0.0.0-it+one", { protocol: { protocol: 2, minProtocol: 1 } });
    expect(client.outcome).toEqual({ kind: "replaced" });
    expect((await tracked.current()).pid).not.toBe(oldRef.pid);
    expect(await tracked.isAlive(oldRef)).toBe(false);
    await tracked.stop(client, await tracked.current());
    await tracked.assertNothingLeft();
  });
});

describe("真实管理进程：桌面应用连着时不被换掉（#358）", () => {
  const app = (build: string, protocol?: { protocol: number; minProtocol: number }) => ({
    client: { kind: "app" as const, version: "0.0.0-it", build },
    ...(protocol === undefined ? {} : { protocol }),
  });

  it("应用的管理进程没有运行时，另一个构建的命令行不替换它：沿用同一个进程，应用的连接照常可用", async () => {
    const appClient = await connect("0.0.0-it+app", app("0.0.0-it+app"));
    const ref = await tracked.current();
    const cli = await connect("0.0.0-it+source");
    expect(cli.outcome).toEqual({
      kind: "outdated",
      reason: "build-differs",
      runs: 0,
      blockedByApp: true,
    });
    expect(cli.launched).toBe(false);
    expect(cli.supervisor.build).toBe("0.0.0-it+app");
    // 同一个进程：应用的连接没断，两边共用同一份状态
    expect((await tracked.current()).pid).toBe(ref.pid);
    expect(await tracked.isAlive(ref)).toBe(true);
    await expect(appClient.call("ping", {})).resolves.toEqual({});
    await expect(cli.call("ping", {})).resolves.toEqual({});
    cli.close();
    await tracked.stop(appClient, ref);
    await tracked.assertNothingLeft();
  });

  it("应用断开之后，另一个构建的命令行照常换新", async () => {
    const appClient = await connect("0.0.0-it+app", app("0.0.0-it+app"));
    const oldRef = await tracked.current();
    appClient.close();
    // 管理进程要过一小会儿才收到应用的断开；被挡的那几次无副作用，重连到不再被挡为止
    let cli = await connect("0.0.0-it+source");
    for (let tries = 0; tries < 100 && cli.outcome.kind !== "replaced"; tries++) {
      cli.close();
      cli = await connect("0.0.0-it+source");
    }
    expect(cli.outcome).toEqual({ kind: "replaced" });
    expect(await tracked.isAlive(oldRef)).toBe(false);
    await tracked.stop(cli, await tracked.current());
    await tracked.assertNothingLeft();
  });

  it("应用在用的管理进程协议更旧、且低于命令行的最低要求：报 SUPERVISOR_OUTDATED，不替换，应用不受影响", async () => {
    const appClient = await connect(
      "0.0.0-it+app",
      app("0.0.0-it+app", { protocol: 1, minProtocol: 1 }),
    );
    const ref = await tracked.current();
    const failure = await connect("0.0.0-it+source", {
      protocol: { protocol: 2, minProtocol: 2 },
    }).catch((error: unknown) => error);
    expect(isClientError(failure) && failure.code).toBe("SUPERVISOR_OUTDATED");
    expect(await tracked.isAlive(ref)).toBe(true);
    await expect(appClient.call("ping", {})).resolves.toEqual({});
    await tracked.stop(appClient, ref);
    await tracked.assertNothingLeft();
  });
});

describe("真实管理进程：连不上、冒充与已知空白", () => {
  it("[SUPERVISOR-LIFECYCLE-18] 发现文件被删而管理进程仍活着：不握手，用不了它（已知空白）；它没被打扰", async () => {
    const client = await connect();
    const ref = await tracked.current();
    client.close();
    await client.closed;
    expectStaleFiles = true;
    // delete-allow: 测试里模拟“发现文件被删”，是临时主目录里的文件
    await unlink(discoveryFilePath(tracked.platform.paths.stateDir));

    const error = await connectSupervisor(
      tracked.options("0.0.0-it+one", { clock: recordingClock(true) }),
    ).catch((e: unknown) => e);
    expect(isClientError(error) && error.code).toBe("SUPERVISOR_UNAVAILABLE");
    // 拉起的新进程撞上锁自己退出了；原来的那个没受影响，只是现在没人拿得到它的口令
    await waitUntil(
      async () => ((await tracked.alive()).length === 1 ? true : undefined),
      "the loser to exit",
    );
    expect(await tracked.isAlive(ref)).toBe(true);
    await tracked.kill(ref);
    expect(expectStaleFiles).toBe(true);
  });

  it("[SUPERVISOR-LIFECYCLE-05] 连接点被不知道口令的进程先占住：握手失败报 SUPERVISOR_UNAVAILABLE，口令没发给占位者", async () => {
    const runDir = absPath(dirname(discoveryFilePath(tracked.platform.paths.stateDir)));
    await tracked.platform.fs.makeDir(runDir);
    const received: Buffer[] = [];
    const squatter = createServer((socket) => {
      socket.on("data", (chunk) => received.push(chunk));
      socket.on("error", () => {});
    });
    servers.push(squatter);
    await new Promise<void>((resolve) => squatter.listen(tracked.platform.ipc.endpoint(), resolve));
    const token = "cd".repeat(32);
    await tracked.platform.fs.writeAtomic(
      discoveryFilePath(tracked.platform.paths.stateDir),
      JSON.stringify({
        formatVersion: 1,
        pid: 999999,
        startedAt: 1,
        endpoint: tracked.platform.ipc.endpoint(),
        token,
        protocol: 1,
        minClientProtocol: 1,
        version: "0",
        build: "x",
        host: "node",
        execPath: process.execPath,
      }),
      { private: true },
    );
    const clock = recordingClock(true);
    const failure = await connectSupervisor(
      tracked.options("0.0.0-it+one", { clock, timeouts: { handshakeMs: 300 } }),
    ).catch((e: unknown) => e);
    expect(isClientError(failure) && failure.code).toBe("SUPERVISOR_UNAVAILABLE");
    // 占位者最多收到过零字节：客户端在收到质询之前什么也不发，而占位者从没发过质询
    expect(Buffer.concat(received).toString("latin1")).not.toContain(token);
    expect(Buffer.concat(received).length).toBe(0);
    expect(await tracked.alive()).toEqual([]);
  });
});
