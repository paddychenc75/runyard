import { chmodSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventually } from "./contract/service-harness.ts";
import { getPlatform } from "./get-platform.ts";
import type { Platform } from "./platform.ts";
import { isPlatformError } from "./platform-error.ts";
import { runRound } from "./test-support/run-contenders.ts";
import { makeTempHome } from "./test-support/temp-home.ts";
import { TrackedProcesses } from "./test-support/tracked-processes.ts";

// 单实例（决策记录 0005，规格 supervisor/lifecycle）。用真进程、真 socket、真内核锁；
// 每个测试自己的临时主目录，每个起的进程都记 pid 加启动时间，收尾时核对后结束。
//
// 轮数：证据 0005 的实验 A 每个系列 20 轮。这里四个系列各 ROUNDS 轮（全新 2 个、全新 8 个、残留 2 个、残留 8 个），
// 每轮 count 个真进程同时开始。进程测试阶段里它独占机器，实测整个文件在 CI 上约 60 到 65 秒，是这个阶段最大的一块；
// 再加轮数就要超出阶段预算（docs/guides/testing.md），所以保持证据里的每系列 20 轮。
const ROUNDS = 20;

const tracker = new TrackedProcesses();
let sandbox: ReturnType<typeof makeTempHome>;
let platform: Platform;
const servers: Server[] = [];

beforeEach(() => {
  sandbox = makeTempHome();
  platform = getPlatform({ home: sandbox.home, profile: undefined });
});

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((r) => server.close(r));
  const survivors = await tracker.killAll();
  sandbox.remove();
  expect(survivors).toEqual([]);
});

afterAll(async () => {
  expect(await tracker.killAll()).toEqual([]);
});

async function runSeries(count: number, stale: boolean, label: string): Promise<void> {
  for (let round = 0; round < ROUNDS; round++) {
    if (stale) {
      // 先起一个赢家再强杀，留下 socket 文件和锁文件，没有进程持有锁
      const first = await runRound(sandbox.home, 1, tracker);
      expect(first.winners).toBe(1);
      await first.killWinners();
      expect(existsSync(platform.ipc.endpoint())).toBe(true);
    }
    const result = await runRound(sandbox.home, count, tracker);
    // 恰好一个赢家；其余的都是“已经有一个了”（BUSY），没有别的失败
    expect(result.winners, `${label} 第 ${round + 1} 轮`).toBe(1);
    expect(result.losers).toEqual(Array(count - 1).fill("LOST:BUSY"));
    await result.finish();
    expect(existsSync(platform.ipc.endpoint()), "关闭后连接点文件被清掉").toBe(false);
  }
}

describe("单实例", () => {
  it("[SUPERVISOR-LIFECYCLE-01] 两个启动者同时启动，最终只有一个监听者", async () => {
    await runSeries(2, false, "全新 2 个");
  });

  it("[SUPERVISOR-LIFECYCLE-01] 八个启动者同时启动（全新），最终只有一个监听者", async () => {
    await runSeries(8, false, "全新 8 个");
  });

  it("[SUPERVISOR-LIFECYCLE-02] 残留 socket 文件加八个启动者并发，只有拿到锁的一个监听", async () => {
    await runSeries(8, true, "残留 8 个");
  });

  it("[SUPERVISOR-LIFECYCLE-02] 残留 socket 文件加两个启动者并发，只有拿到锁的一个监听", async () => {
    await runSeries(2, true, "残留 2 个");
  });

  it("[SUPERVISOR-LIFECYCLE-03] 进程被强杀后锁随之释放，新启动者无需清理就能监听，并能被连上", async () => {
    const first = await runRound(sandbox.home, 1, tracker);
    expect(first.winners).toBe(1);
    await first.killWinners();
    // 残留：文件还在，但没有人在监听
    await expect(platform.ipc.connect(500)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
    const server = await platform.ipc.listen();
    servers.push(server);
    const socket = await platform.ipc.connect(1000);
    socket.destroy();
  });
});

describe("连接点被抢先占住", () => {
  it("[SUPERVISOR-LIFECYCLE-05] 别的进程已持有锁（真的管理进程在）：listen 抛 BUSY，且不碰对方的连接点", async () => {
    const holder = await runRound(sandbox.home, 1, tracker);
    expect(holder.winners).toBe(1);
    try {
      await expect(platform.ipc.listen()).rejects.toMatchObject({ error: { code: "BUSY" } });
      // 对方的连接点还在、还连得上：没有被我们删掉
      const socket = await platform.ipc.connect(1000);
      socket.destroy();
    } finally {
      await holder.finish();
    }
  });

  it("决策记录 0005：占住 socket 文件但没有锁的进程，会被拿到锁的新监听者取代", async () => {
    // 能在 700 的 run/ 里建文件的只有本人，所以没有锁的占位者按“残留”处理（证据实验 E）
    const endpoint = platform.ipc.endpoint();
    const squatter = createServer((s) => s.destroy());
    servers.push(squatter);
    // 先让 listen 建好目录并立刻关掉，再让占位者在同一路径上监听
    const probe = await platform.ipc.listen();
    await new Promise((r) => probe.close(r));
    await new Promise<void>((r) => squatter.listen({ path: endpoint }, r));
    let squatterGotConnection = false;
    squatter.on("connection", () => {
      squatterGotConnection = true;
    });
    const real = await platform.ipc.listen();
    servers.push(real);
    let realGotConnection = false;
    real.on("connection", () => {
      realGotConnection = true;
    });
    const socket = await platform.ipc.connect(1000);
    // 等“真监听者收到连接”这个可观察的结果，而不是睡一小会儿；上限给得宽，慢机器也够
    await eventually(() => realGotConnection, 30_000, "真监听者收到连接");
    socket.destroy();
    expect(realGotConnection).toBe(true);
    expect(squatterGotConnection).toBe(false);
  });

  it("同一进程里第二次 listen 也被锁挡住（BUSY），关闭第一个之后又能拿到", async () => {
    const first = await platform.ipc.listen();
    await expect(platform.ipc.listen()).rejects.toMatchObject({ error: { code: "BUSY" } });
    await new Promise((r) => first.close(r));
    const second = await platform.ipc.listen();
    servers.push(second);
  });
});

describe("权限", () => {
  const mode = (path: string) => statSync(path).mode & 0o777;

  it("run/ 目录 700，socket 600；锁文件（有的话）600", async () => {
    const server = await platform.ipc.listen();
    servers.push(server);
    const endpoint = platform.ipc.endpoint();
    expect(mode(dirname(endpoint))).toBe(0o700);
    expect(mode(endpoint)).toBe(0o600);
    const lockFile = `${dirname(endpoint)}/supervisor.lock`;
    if (existsSync(lockFile)) expect(mode(lockFile)).toBe(0o600);
    // 除了可有可无的锁文件（linux 用抽象 socket，没有），目录里只有 socket
    const others = readdirSync(dirname(endpoint)).filter((name) => name !== "supervisor.lock");
    expect(others).toEqual(["supervisor.sock"]);
  });

  it("进程的 umask 再宽松，socket 也是 600；listen 之后 umask 恢复原样", async () => {
    const before = process.umask(0o000);
    try {
      const server = await platform.ipc.listen();
      servers.push(server);
      expect(mode(platform.ipc.endpoint())).toBe(0o600);
      expect(process.umask()).toBe(0o000);
    } finally {
      process.umask(before);
    }
  });

  it("run/ 目录原来是 755，listen 把它收紧到 700", async () => {
    const probe = await platform.ipc.listen();
    await new Promise((r) => probe.close(r));
    const dir = dirname(platform.ipc.endpoint());
    chmodSync(dir, 0o755);
    const server = await platform.ipc.listen();
    servers.push(server);
    expect(mode(dir)).toBe(0o700);
  });
});

describe("连接", () => {
  it("[SUPERVISOR-LIFECYCLE-10] 没有监听者时 connect 抛 SUPERVISOR_UNAVAILABLE，不是原始系统错误", async () => {
    const error = await platform.ipc.connect(300).catch((e: unknown) => e);
    expect(isPlatformError(error)).toBe(true);
    if (isPlatformError(error)) expect(error.error.code).toBe("SUPERVISOR_UNAVAILABLE");
  });

  it("连接点文件存在但没有进程监听（残留）时同样抛 SUPERVISOR_UNAVAILABLE", async () => {
    const endpoint = platform.ipc.endpoint();
    const probe = await platform.ipc.listen();
    await new Promise((r) => probe.close(r));
    writeFileSync(endpoint, "");
    await expect(platform.ipc.connect(300)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
  });

  it("[SUPERVISOR-LIFECYCLE-06] 开发版和正式版可以同时监听，各连各的", async () => {
    const dev = getPlatform({ home: sandbox.home, profile: "dev" });
    const prodServer = await platform.ipc.listen();
    const devServer = await dev.ipc.listen();
    servers.push(prodServer, devServer);
    expect(platform.ipc.endpoint()).not.toBe(dev.ipc.endpoint());
    const [a, b] = await Promise.all([platform.ipc.connect(1000), dev.ipc.connect(1000)]);
    a.destroy();
    b.destroy();
  });
});
