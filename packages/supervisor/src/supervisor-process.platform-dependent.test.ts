import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import { type SupervisorFile, supervisorFileFormat } from "@runyard/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoveryFilePath } from "./discovery-file.ts";
import {
  makeShortHome,
  ProcessLedger,
  platformAt,
  type RunningSupervisor,
  readDiscoveryFile,
  waitUntil,
} from "./process-harness.test.ts";
import { EXIT_ALREADY_RUNNING_LINE } from "./run-main.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 把真正的入口当作单独的 Node 进程来跑，在临时主目录里（绝不碰 ~/.runyard）。
// 每个起过的进程都按 pid 加启动时间记账，teardown 时核对没有漏网的（漏了就让测试失败，并强行收掉）。

let home: AbsPath;
let removeHome: () => void;
let platform: Platform;
let ledger: ProcessLedger;
const servers: Server[] = [];
const clients: TestClient[] = [];

beforeEach(() => {
  const made = makeShortHome();
  home = made.home;
  removeHome = made.remove;
  platform = platformAt(home);
  ledger = new ProcessLedger(platform);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.destroy();
  for (const server of servers.splice(0)) server.close();
  const leaked = await ledger.reap();
  removeHome();
  // 正常结束的测试在这里应该什么都不剩；有漏的说明某个测试没把自己起的进程收干净
  expect(leaked).toEqual([]);
});

function readDiscovery(at: Platform = platform): SupervisorFile | undefined {
  return readDiscoveryFile(discoveryFilePath(at.paths.stateDir));
}

async function waitReady(
  running: RunningSupervisor,
  at: Platform = platform,
): Promise<SupervisorFile> {
  return waitUntil(() => {
    if (running.hasExited()) throw new Error(`supervisor exited early: ${running.stderr()}`);
    const file = readDiscovery(at);
    return file?.pid === running.pid ? file : undefined;
  }, "the discovery file");
}

async function connect(at: Platform = platform): Promise<TestClient> {
  const client = await TestClient.connect(at);
  clients.push(client);
  return client;
}

async function openSession(file: SupervisorFile, at: Platform = platform): Promise<TestClient> {
  const client = await connect(at);
  await client.handshake(at, tokenBytes(file.token));
  return client;
}

async function stop(running: RunningSupervisor, at: Platform = platform): Promise<void> {
  const file = readDiscovery(at);
  if (file === undefined) return;
  const client = await openSession(file, at);
  await client.request("supervisor.shutdown", { ifIdle: false, reason: "user" });
  expect(await running.exited).toBe(0);
}

describe("真实进程：启动与发现文件", () => {
  it("[SUPERVISOR-LIFECYCLE-11] 监听完成后发现文件内容齐全，只有本人可读，目录 700，连接点 600，没有临时文件残留", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    expect(file).toMatchObject({
      formatVersion: 2,
      pid: running.pid,
      // 真进程自己写的启动时间，和平台层从外面查到的一致：客户端靠它确认“还是不是这个进程”
      processStart: (await platform.proc.identity(running.pid))?.startTime,
      endpoint: platform.ipc.endpoint(),
      protocol: 1,
      version: "0.0.0-it",
      build: "0.0.0-it+one",
      host: "node",
      execPath: process.execPath,
    });
    expect(file.token).toMatch(/^[0-9a-f]{64}$/);
    const runDir = join(platform.paths.stateDir, "run");
    const mode = (path: string) => statSync(path).mode & 0o777;
    expect(mode(join(runDir, "supervisor.json"))).toBe(0o600);
    expect(mode(runDir)).toBe(0o700);
    expect(mode(platform.ipc.endpoint())).toBe(0o600);
    expect(readdirSync(runDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    // 文件本身能被协议的文件格式读回来
    expect(supervisorFileFormat.name).toBe("supervisor.json");
    await stop(running);
  });

  it("[SUPERVISOR-LIFECYCLE-01] 同时启动多个：只有一个存活，其余自己退出（退出码 0、说明已有管理进程），连上的是同一个", async () => {
    const racers = Array.from({ length: 5 }, () => ledger.startSupervisor(home));
    await waitUntil(
      () => (racers.filter((r) => r.hasExited()).length >= 4 ? true : undefined),
      "four losers",
    );
    const survivors = racers.filter((r) => !r.hasExited());
    expect(survivors).toHaveLength(1);
    const winner = survivors[0] as RunningSupervisor;
    for (const loser of racers.filter((r) => r !== winner)) {
      expect(await loser.exited).toBe(0);
      expect(loser.stderr()).toContain(EXIT_ALREADY_RUNNING_LINE);
    }
    const file = await waitReady(winner);
    // 两个客户端连上的是同一个管理进程
    const a = await openSession(file);
    const b = await openSession(file);
    const infoA = (await a.request("supervisor.info")) as { result: { build: string } };
    expect(infoA.result.build).toBe("0.0.0-it+one");
    expect(await b.request("ping")).toMatchObject({ ok: true });
    expect(readDiscovery()?.pid).toBe(winner.pid);
    await stop(winner);
  });

  it("[SUPERVISOR-LIFECYCLE-03] 管理进程被强杀后，新的能拿到锁并正常监听，不需要人工清理", async () => {
    const first = ledger.startSupervisor(home);
    const oldFile = await waitReady(first);
    await ledger.kill(first);
    // 残留还在：连接点文件和发现文件
    expect(existsSync(platform.ipc.endpoint())).toBe(true);
    expect(readDiscovery()?.token).toBe(oldFile.token);

    const second = ledger.startSupervisor(home);
    const newFile = await waitReady(second);
    expect(newFile.pid).toBe(second.pid);
    expect(newFile.token).not.toBe(oldFile.token);
    // 旧口令对新的管理进程已经没用
    const stale = await connect();
    const challenge = await stale.readChallenge();
    stale.write(stale.buildHello(platform, tokenBytes(oldFile.token), challenge));
    expect(await stale.next()).toBeUndefined();
    const fresh = await openSession(newFile);
    expect(await fresh.request("ping")).toMatchObject({ ok: true });
    await stop(second);
  });

  it("[SUPERVISOR-LIFECYCLE-02] 强杀留下残留，再并发启动：只有拿到锁的一个监听，不出现第二个监听者", async () => {
    const first = ledger.startSupervisor(home);
    await waitReady(first);
    await ledger.kill(first);

    const racers = Array.from({ length: 4 }, () => ledger.startSupervisor(home));
    await waitUntil(
      () => (racers.filter((r) => r.hasExited()).length >= 3 ? true : undefined),
      "three losers",
    );
    const survivors = racers.filter((r) => !r.hasExited());
    expect(survivors).toHaveLength(1);
    const winner = survivors[0] as RunningSupervisor;
    const file = await waitReady(winner);
    const client = await openSession(file);
    expect(await client.request("ping")).toMatchObject({ ok: true });
    // 存活的管理进程只有赢家
    expect(await ledger.alive()).toEqual([winner.pid]);
    await stop(winner);
  });

  it("[SUPERVISOR-LIFECYCLE-05] 连接点被不持锁的进程先占住（残留文件或外来 socket）：被替换，管理进程照常起来，占位者拿不到任何字节", async () => {
    const run = join(platform.paths.stateDir, "run");
    await platform.fs.makeDir(absPath(run));
    const received: Buffer[] = [];
    const squatter = createServer((socket) => {
      socket.on("data", (chunk) => received.push(chunk));
    });
    servers.push(squatter);
    await new Promise<void>((resolve) => squatter.listen(platform.ipc.endpoint(), resolve));

    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const client = await openSession(file);
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(Buffer.concat(received).length).toBe(0);
    expect(client.wire().toString("latin1")).not.toContain(file.token);
    await stop(running);
  });

  it("[SUPERVISOR-LIFECYCLE-05] 持锁的真管理进程在：另一个启动者起不来（退出码 0 加说明），口令不会发给任何人", async () => {
    const first = ledger.startSupervisor(home);
    const file = await waitReady(first);
    const second = ledger.startSupervisor(home);
    expect(await second.exited).toBe(0);
    expect(second.stderr()).toContain(EXIT_ALREADY_RUNNING_LINE);
    // 第一个没被打扰：发现文件还是它的
    expect(readDiscovery()).toEqual(file);
    expect(await (await openSession(file)).request("ping")).toMatchObject({ ok: true });
    await stop(first);
  });

  it("[SUPERVISOR-LIFECYCLE-06] 开发版和正式版各有自己的连接点和发现文件，互不影响", async () => {
    const dev = platformAt(home, "dev");
    const prod = ledger.startSupervisor(home);
    const devProc = ledger.startSupervisor(home, ["--profile", "dev"]);
    const prodFile = await waitReady(prod);
    const devFile = await waitReady(devProc, dev);
    expect(dev.ipc.endpoint()).not.toBe(platform.ipc.endpoint());
    expect(devFile.endpoint).not.toBe(prodFile.endpoint);
    expect(devFile.token).not.toBe(prodFile.token);
    expect(await (await openSession(prodFile)).request("ping")).toMatchObject({ ok: true });
    expect(await (await openSession(devFile, dev)).request("ping")).toMatchObject({ ok: true });
    await stop(prod);
    // 关掉正式版不影响开发版
    expect(devProc.hasExited()).toBe(false);
    await stop(devProc, dev);
  });
});

describe("真实进程：握手与连接", () => {
  it("[PROTOCOL-HANDSHAKE-01] 真实 socket 上完整握手，之后能发请求；两个方向的字节里都没有口令", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const client = await openSession(file);
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(await client.request("supervisor.info")).toMatchObject({
      ok: true,
      result: {
        protocol: 1,
        version: "0.0.0-it",
        build: "0.0.0-it+one",
        startedBy: "cli",
        runs: 0,
      },
    });
    const wire = client.wire();
    const raw = Buffer.from(file.token, "hex");
    for (const form of [
      file.token,
      raw.toString("base64"),
      raw.toString("base64url"),
      raw.toString("latin1"),
    ]) {
      expect(wire.toString("latin1")).not.toContain(form);
    }
    await stop(running);
  });

  it("[PROTOCOL-HANDSHAKE-02] 错误口令、冒充者（不知道口令）都被断开，且口令没上线；管理进程不受影响", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);

    const wrongToken = await connect();
    const challenge = await wrongToken.readChallenge();
    wrongToken.write(wrongToken.buildHello(platform, randomBytes(32), challenge));
    expect(await wrongToken.next()).toBeUndefined();

    const garbage = await connect();
    await garbage.readChallenge();
    garbage.writeRaw('{"t":"hello"}\n');
    expect(await garbage.next()).toBeUndefined();

    for (const client of [wrongToken, garbage]) {
      expect(client.wire().toString("latin1")).not.toContain(file.token);
    }
    expect(await (await openSession(file)).request("ping")).toMatchObject({ ok: true });
    await stop(running);
  });

  it("[PROTOCOL-HANDSHAKE-04] 长度不对的 clientNonce 被断开，不继续握手", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    for (const clientNonce of ["", "ab".repeat(31), "ab".repeat(33)]) {
      const client = await connect();
      const challenge = await client.readChallenge();
      client.write(client.buildHello(platform, tokenBytes(file.token), challenge, { clientNonce }));
      expect(await client.next()).toBeUndefined();
    }
    await stop(running);
  });

  it("[PROTOCOL-HANDSHAKE-06] 握手之前到达的请求不被处理，连接被断开", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const client = await connect();
    await client.readChallenge();
    client.write({
      t: "req",
      id: 1,
      method: "supervisor.shutdown",
      params: { ifIdle: false, reason: "user" },
    });
    expect(await client.next()).toBeUndefined();
    // 请求没有被执行：管理进程仍在
    expect(running.hasExited()).toBe(false);
    expect(await (await openSession(file)).request("ping")).toMatchObject({ ok: true });
    await stop(running);
  });

  it("[PROTOCOL-HANDSHAKE-19] 超过 8 MB 的一行：只关这个连接，管理进程和其他连接不受影响", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const good = await openSession(file);
    const bad = await openSession(file);
    bad.writeRaw(Buffer.alloc(8 * 1024 * 1024 + 4096, 0x61));
    await bad.closed;
    expect(running.hasExited()).toBe(false);
    expect(await good.request("ping")).toMatchObject({ ok: true });
    await stop(running);
  });
});

describe("真实进程：关闭", () => {
  it("收到终止信号：清掉发现文件和连接点，释放锁（下一个启动者立刻能起来），退出码 0", async () => {
    const first = ledger.startSupervisor(home);
    await waitReady(first);
    await ledger.terminate(first);
    expect(await first.exited).toBe(0);
    expect(readDiscovery()).toBeUndefined();
    expect(existsSync(platform.ipc.endpoint())).toBe(false);
    const second = ledger.startSupervisor(home);
    await waitReady(second);
    await stop(second);
  });

  it("[SUPERVISOR-LIFECYCLE-15] 没有运行时 shutdown { ifIdle: true, reason: 'upgrade' } 会关闭并退出", async () => {
    const running = ledger.startSupervisor(home);
    const file = await waitReady(running);
    const client = await openSession(file);
    expect(
      await client.request("supervisor.shutdown", { ifIdle: true, reason: "upgrade" }),
    ).toMatchObject({
      result: { closing: true },
    });
    expect(await running.exited).toBe(0);
    expect(readDiscovery()).toBeUndefined();
  });

  it("参数不对：退出码 2，不监听、不写发现文件", async () => {
    const child = ledger.startSupervisor(home, ["--profile", "nonsense"]);
    expect(await child.exited).toBe(2);
    expect(readDiscovery()).toBeUndefined();
  });
});
