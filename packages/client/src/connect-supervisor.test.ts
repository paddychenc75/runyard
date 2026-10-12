import { dirname } from "node:path/posix";
import { absPath, discoveryFilePath, supervisorLogPath } from "@runyard/platform";
import { settle } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { isClientError } from "./client-error.ts";
import { disposeWorlds, World } from "./client-harness.test.ts";
import { connectSupervisor } from "./connect-supervisor.ts";

let world: World;
afterEach(disposeWorlds);

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isClientError(error)) return error;
    throw error;
  }
  throw new Error("expected a ClientError");
}

describe("握手：连上真的管理进程", () => {
  it("[PROTOCOL-HANDSHAKE-01] 验证完服务端证明才发第一个请求，连接上的字节不含口令", async () => {
    world = new World();
    await world.makeExecutable("/fake/node");
    const supervisor = await world.supervisor();
    await supervisor.publishDiscovery();
    const client = await connectSupervisor(world.options());
    expect(client.launched).toBe(false);
    expect(supervisor.helloCount).toBe(1);
    // 握手本身没有请求；之后第一个请求是版本比对要的 supervisor.info
    expect(supervisor.requests[0]?.method).toBe("supervisor.info");
    const wire = supervisor.wire().toString("latin1");
    expect(wire).not.toContain(supervisor.token);
    expect(wire).not.toContain(Buffer.from(supervisor.token, "hex").toString("latin1"));
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-02] 冒充者回出看似合法的 ready：断开，报 SUPERVISOR_UNAVAILABLE，没有请求，口令没出现过", async () => {
    world = new World();
    const impostor = await world.supervisor({ behaviour: "impostor" });
    await impostor.publishDiscovery();
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(impostor.requests).toEqual([]);
    expect(impostor.wire().toString("latin1")).not.toContain(impostor.token);
    // 有人在监听却过不了握手：不去拉起（拉起的进程也拿不到连接点）
    expect(world.spawned).toEqual([]);
  });

  it("[PROTOCOL-HANDSHAKE-03] 没有发现文件：不连接、不发任何握手消息，去拉起一个", async () => {
    world = new World();
    const idle = await world.supervisor();
    world.onSpawn = async () => {
      // 新进程起来后写发现文件
      await idle.publishDiscovery();
    };
    await world.makeExecutable("/fake/node");
    const client = await connectSupervisor(world.options());
    // 拉起前没有任何连接尝试（这个测试管理进程一直在监听，却没收到过握手）
    expect(world.spawned).toHaveLength(1);
    expect(client.launched).toBe(true);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-03] 发现文件不是合法内容也按没有处理", async () => {
    world = new World();
    const idle = await world.supervisor();
    const file = discoveryFilePath(world.platform.paths.stateDir);
    await world.platform.fs.makeDir(absPath(dirname(file)));
    await world.platform.fs.writeFile(file, "{ half");
    world.onSpawn = async () => idle.publishDiscovery();
    await world.makeExecutable("/fake/node");
    const client = await connectSupervisor(world.options());
    expect(world.spawned).toHaveLength(1);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-04] 收到的 nonce 长度不是 32 字节：不发 hello，直接断开", async () => {
    world = new World();
    const supervisor = await world.supervisor({ behaviour: "short-nonce" });
    await supervisor.publishDiscovery();
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(supervisor.helloCount).toBe(0);
    expect(supervisor.wire().length).toBe(0);
  });

  it("[PROTOCOL-HANDSHAKE-05] 空 nonce 加原样回传：断开并报 SUPERVISOR_UNAVAILABLE，没发出任何应答", async () => {
    world = new World();
    const supervisor = await world.supervisor({ behaviour: "empty-nonce-echo" });
    await supervisor.publishDiscovery();
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(supervisor.helloCount).toBe(0);
    expect(supervisor.requests).toEqual([]);
  });

  it("[SUPERVISOR-LIFECYCLE-05] 连接点被不知道口令、也不作声的进程占住：握手超时后报 SUPERVISOR_UNAVAILABLE，口令没有被发送", async () => {
    world = new World();
    const squatter = await world.supervisor({ behaviour: "silent" });
    await squatter.publishDiscovery();
    const pending = failure(connectSupervisor(world.options()));
    // 等客户端连上并开始等质询，再推进假时间让握手超时
    while (squatter.connections === 0) await new Promise((resolve) => setImmediate(resolve));
    await settle();
    await world.clock.advance(3000);
    const error = await pending;
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(squatter.wire().length).toBe(0);
    expect(world.spawned).toEqual([]);
  });
});

describe("拉起管理进程与重连", () => {
  it("[SUPERVISOR-LIFECYCLE-07] 没有管理进程：经 spawnDetached 拉起，参数只走命令行，日志写到状态目录，然后完成请求", async () => {
    world = new World();
    await world.makeExecutable("/fake/node");
    const next = await world.supervisor();
    world.onSpawn = async () => next.publishDiscovery();
    const client = await connectSupervisor(
      world.options({
        launch: { command: ["/fake/node", "/fake/main.ts"], host: "node", profile: "dev" },
      }),
    );
    const [spawn] = world.spawned;
    expect(spawn?.argv).toEqual([
      "/fake/node",
      "/fake/main.ts",
      "--home",
      world.platform.paths.home,
      "--version",
      "1.0.0",
      "--build",
      "1.0.0+aaaa",
      "--started-by",
      "cli",
      "--host",
      "node",
      "--profile",
      "dev",
    ]);
    expect(spawn?.logFile).toBe(supervisorLogPath(world.platform.paths.stateDir));
    expect(client.launched).toBe(true);
    await expect(client.call("ping", {})).resolves.toEqual({});
    client.close();
  });

  it("[SUPERVISOR-LIFECYCLE-10] 启动期间连接失败：按 50、100、200 毫秒退避重试，在上限之前连上", async () => {
    world = new World();
    await world.makeExecutable("/fake/node");
    const next = await world.supervisor();
    // 第 3 次睡眠（累计 350 毫秒）之后才开始监听并写发现文件
    world.afterSleep = async () => {
      if (world.sleeps.length === 3) await next.publishDiscovery();
    };
    const client = await connectSupervisor(world.options());
    expect(world.sleeps).toEqual([50, 100, 200]);
    expect(client.launched).toBe(true);
    client.close();
  });

  it("[SUPERVISOR-LIFECYCLE-10] 超过 3 秒仍连不上：报 SUPERVISOR_UNAVAILABLE，退避之后保持 200 毫秒", async () => {
    world = new World();
    const started = world.clock.now();
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(world.sleeps.slice(0, 4)).toEqual([50, 100, 200, 200]);
    expect(world.sleeps.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(world.clock.now() - started).toBe(3000);
  });

  it("[SUPERVISOR-LIFECYCLE-10] 启动失败（平台层拒绝拉起）也是 SUPERVISOR_UNAVAILABLE", async () => {
    world = new World();
    world.spawnFails = true;
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
  });

  it("残留的发现文件（没有人在监听）：当作没有管理进程，拉起新的，并改读新写的发现文件", async () => {
    world = new World();
    await world.makeExecutable("/fake/node");
    const ghost = await world.supervisor({ pid: 111 });
    await ghost.publishDiscovery();
    await ghost.stop();
    world.onSpawn = async () => {
      const next = await world.supervisor({ pid: 222 });
      await next.publishDiscovery();
    };
    const client = await connectSupervisor(world.options());
    expect(client.launched).toBe(true);
    expect(world.supervisors[1]?.helloCount).toBe(1);
    client.close();
  });

  it("[SUPERVISOR-LIFECYCLE-18] 发现文件被删而管理进程仍在：不发握手消息，也用不了它（已知空白）", async () => {
    world = new World();
    const alive = await world.supervisor();
    // 没有发现文件。拉起的新进程撞上锁自己退出，所以始终没有新文件
    const error = await failure(connectSupervisor(world.options()));
    expect(error.code).toBe("SUPERVISOR_UNAVAILABLE");
    expect(alive.connections).toBe(0);
    expect(alive.helloCount).toBe(0);
    expect(world.spawned.length).toBe(1);
  });
});

describe("版本表", () => {
  async function setup(
    supervisor: Parameters<World["supervisor"]>[0],
    publish: Parameters<Awaited<ReturnType<World["supervisor"]>>["publishDiscovery"]>[0] = {},
  ) {
    await world.makeExecutable("/fake/node");
    const running = await world.supervisor(supervisor);
    await running.publishDiscovery(publish);
    return running;
  }

  it("[PROTOCOL-HANDSHAKE-07] 协议版本和构建标识都相同：直接使用，不发 shutdown", async () => {
    world = new World();
    const running = await setup({ build: "1.0.0+aaaa" });
    const client = await connectSupervisor(world.options());
    expect(client.outcome).toEqual({ kind: "current" });
    expect(running.requests.map((r) => r.method)).toEqual(["supervisor.info"]);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-08] 构建标识不同且没有运行：发 shutdown { ifIdle: true, reason: 'upgrade' }，等它退出后拉起自己带的", async () => {
    world = new World();
    const old = await setup({ build: "1.0.0+old" });
    world.onSpawn = async () => {
      const fresh = await world.supervisor({ build: "1.0.0+aaaa" });
      await fresh.publishDiscovery();
    };
    const client = await connectSupervisor(world.options());
    expect(old.requests.map((r) => r.method)).toEqual(["supervisor.info", "supervisor.shutdown"]);
    expect(old.requests[1]?.params).toEqual({ ifIdle: true, reason: "upgrade" });
    expect(client.outcome).toEqual({ kind: "replaced" });
    expect(client.supervisor.build).toBe("1.0.0+aaaa");
    expect(world.spawned).toHaveLength(1);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-09] 构建标识不同且有运行：沿用旧的，不发 shutdown，给应用提示信息", async () => {
    world = new World();
    const old = await setup({ build: "1.0.0+old", runs: 2 });
    const client = await connectSupervisor(world.options());
    expect(client.outcome).toEqual({ kind: "outdated", reason: "build-differs", runs: 2 });
    expect(old.requests.map((r) => r.method)).toEqual(["supervisor.info"]);
    expect(world.spawned).toEqual([]);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-10] 发现文件里的可执行文件已不存在：按构建标识不同处理（没有运行就换新）", async () => {
    world = new World();
    // 构建标识相同，但 /gone 这个文件不存在
    const old = await setup({ build: "1.0.0+aaaa" }, { execPath: "/gone/node" });
    world.onSpawn = async () => {
      const fresh = await world.supervisor({ build: "1.0.0+aaaa" });
      await fresh.publishDiscovery();
    };
    const client = await connectSupervisor(world.options());
    expect(old.requests.map((r) => r.method)).toContain("supervisor.shutdown");
    expect(client.outcome).toEqual({ kind: "replaced" });
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-10] 可执行文件不存在且有运行：沿用并提示", async () => {
    world = new World();
    await setup({ build: "1.0.0+aaaa", runs: 1 }, { execPath: "/gone/node" });
    const client = await connectSupervisor(world.options());
    expect(client.outcome).toEqual({ kind: "outdated", reason: "build-differs", runs: 1 });
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-11] 管理进程较旧且没有运行：换成自己带的新版", async () => {
    world = new World();
    const old = await setup({ protocol: 1, minProtocol: 1 });
    world.onSpawn = async () => {
      const fresh = await world.supervisor({ protocol: 2, minProtocol: 1, build: "1.0.0+aaaa" });
      await fresh.publishDiscovery();
    };
    const client = await connectSupervisor(
      world.options({ protocol: { protocol: 2, minProtocol: 1 } }),
    );
    expect(old.requests.map((r) => r.method)).toContain("supervisor.shutdown");
    expect(client.outcome).toEqual({ kind: "replaced" });
    expect(client.supervisor.protocol).toBe(2);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-12] 管理进程较旧、有运行、仍满足最低要求：兼容使用，不停运行", async () => {
    world = new World();
    const old = await setup({ protocol: 1, minProtocol: 1, runs: 3 });
    const client = await connectSupervisor(
      world.options({ protocol: { protocol: 2, minProtocol: 1 } }),
    );
    expect(client.outcome).toEqual({ kind: "outdated", reason: "protocol-older", runs: 3 });
    expect(old.requests.map((r) => r.method)).toEqual(["supervisor.info"]);
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-13] 管理进程较旧、有运行、不满足最低要求：SUPERVISOR_OUTDATED 带运行个数，之后不再发请求", async () => {
    world = new World();
    const old = await setup({ protocol: 1, minProtocol: 1, runs: 2 });
    const error = await failure(
      connectSupervisor(world.options({ protocol: { protocol: 2, minProtocol: 2 } })),
    );
    expect(error.known).toMatchObject({ code: "SUPERVISOR_OUTDATED", params: { runs: 2 } });
    expect(old.requests.map((r) => r.method)).toEqual(["supervisor.info"]);
    expect(world.spawned).toEqual([]);
  });

  it("[PROTOCOL-HANDSHAKE-14] 客户端低于管理进程要求的最低版本：CLIENT_OUTDATED，一个请求也不发", async () => {
    world = new World();
    const newer = await setup({ protocol: 3, minProtocol: 2 });
    const error = await failure(
      connectSupervisor(world.options({ protocol: { protocol: 1, minProtocol: 1 } })),
    );
    expect(error.known).toMatchObject({ code: "CLIENT_OUTDATED", params: {} });
    expect(newer.requests).toEqual([]);
  });

  it("管理进程较新但客户端仍满足它的最低要求：照常使用", async () => {
    world = new World();
    await setup({ protocol: 3, minProtocol: 1, build: "1.0.0+aaaa" });
    const client = await connectSupervisor(
      world.options({ protocol: { protocol: 2, minProtocol: 1 } }),
    );
    expect(client.outcome).toEqual({ kind: "current" });
    client.close();
  });

  it("换新时恰好有了运行（shutdown 回 closing: false）：沿用旧的，不拉起，运行个数取最新的", async () => {
    world = new World();
    let old: Awaited<ReturnType<typeof setup>> | undefined;
    old = await setup({
      build: "1.0.0+old",
      respond: (method) => {
        if (method !== "supervisor.shutdown") return undefined;
        if (old) old.runs = 1;
        return { result: { closing: false } };
      },
    });
    const client = await connectSupervisor(world.options());
    expect(client.outcome).toEqual({ kind: "outdated", reason: "build-differs", runs: 1 });
    expect(world.spawned).toEqual([]);
    client.close();
  });
});
