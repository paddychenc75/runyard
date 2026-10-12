import { decideVersionAction, type VersionDecision } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { identity, World } from "./supervisor-harness.test.ts";
import type { TestClient } from "./test-client.ts";

let world = new World();
afterEach(() => world.dispose());

const UPGRADE = { ifIdle: true, reason: "upgrade" } as const;

describe("有条件关闭", () => {
  it("[SUPERVISOR-LIFECYCLE-15] 有运行时 shutdown { ifIdle: true, reason: 'upgrade' }：不退出，运行不受影响，响应说明未关闭", async () => {
    world = new World();
    const handle = await world.start({ extend: () => ({ runCount: () => 1 }) });
    const client = await world.session(handle);
    expect(await client.request("supervisor.shutdown", UPGRADE)).toMatchObject({
      ok: true,
      result: { closing: false },
    });
    expect(await client.request("supervisor.info")).toMatchObject({ result: { runs: 1 } });
    expect(world.discovery.file).toBeDefined();
    // 新连接照样能握手
    expect(await (await world.session(handle)).request("ping")).toMatchObject({ ok: true });
  });

  it("没有运行时 ifIdle 关闭会退出：响应先到，连接再关，发现文件和连接点释放", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.session(handle);
    const response = await client.request("supervisor.shutdown", UPGRADE);
    expect(response).toMatchObject({ ok: true, result: { closing: true } });
    await handle.closed;
    await client.closed;
    expect(world.discovery.file).toBeUndefined();
    await expect(world.fake.platform.ipc.connect(200)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
  });

  it("ifIdle 为 false 时有运行也退出，且先让运行的收尾钩子（#40）跑完再关会话", async () => {
    world = new World();
    const order: string[] = [];
    const handle = await world.start({
      extend: () => ({
        runCount: () => 2,
        onShutdown: async (reason) => {
          order.push(`onShutdown:${reason}`);
        },
      }),
    });
    const client = await world.session(handle);
    const response = await client.request("supervisor.shutdown", { ifIdle: false, reason: "user" });
    expect(response).toMatchObject({ result: { closing: true } });
    await handle.closed;
    expect(order).toEqual(["onShutdown:user"]);
  });

  it("关闭时有只发了半句话的连接：宽限期一到强行断开，不会一直挂着", async () => {
    world = new World();
    const handle = await world.start();
    const stuck = await world.connect();
    await stuck.readChallenge();
    const closing = handle.api.shutdown("user");
    await world.clock.advance(2000);
    await closing;
    await stuck.closed;
    expect(handle.connectionCount()).toBe(0);
  });
});

// 版本表（decisions 0005；docs/architecture/protocol.md §5）的服务端一半：
// 客户端靠握手里报的版本、构建标识和 supervisor.info 的运行个数得出结论（decideVersionAction，#44 才是真客户端），
// 这里用同一个函数得出结论，再执行结论要求的动作，核对管理进程的反应。
async function decide(
  client: TestClient,
  clientVersion: { protocol: number; minProtocol: number; build: string },
  options: { executableExists?: boolean } = {},
): Promise<VersionDecision> {
  const challenge = client.challenge;
  if (challenge === undefined) throw new Error("client has not completed the handshake");
  const info = (await client.request("supervisor.info")) as {
    result: { protocol: number; build: string; runs: number };
  };
  return decideVersionAction({
    client: clientVersion,
    supervisor: {
      protocol: info.result.protocol,
      minProtocol: challenge.minProtocol,
      build: info.result.build,
    },
    runs: info.result.runs,
    executableExists: options.executableExists ?? true,
  });
}

describe("版本表（服务端一半，客户端一半归 #44）", () => {
  const same = { protocol: 1, minProtocol: 1, build: "0.0.0-test+aaaa" };
  const differentBuild = { ...same, build: "0.0.0-test+bbbb" };

  it("[PROTOCOL-HANDSHAKE-07] 版本和构建标识都相同：直接使用", async () => {
    world = new World();
    const client = await world.session(await world.start(), same);
    expect(await decide(client, same)).toEqual({ action: "use" });
  });

  it("[PROTOCOL-HANDSHAKE-08] 构建标识不同且没有运行：换新，旧的收到 ifIdle 关闭后退出", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.session(handle, differentBuild);
    expect(await decide(client, differentBuild)).toEqual({ action: "replace" });
    expect(await client.request("supervisor.shutdown", UPGRADE)).toMatchObject({
      result: { closing: true },
    });
    await handle.closed;
  });

  it("[PROTOCOL-HANDSHAKE-09] 构建标识不同且有运行：沿用旧的，ifIdle 关闭被拒绝，不停任何运行", async () => {
    world = new World();
    const handle = await world.start({ extend: () => ({ runCount: () => 1 }) });
    const client = await world.session(handle, differentBuild);
    expect(await decide(client, differentBuild)).toEqual({
      action: "use-outdated",
      reason: "build-differs",
    });
    expect(await client.request("supervisor.shutdown", UPGRADE)).toMatchObject({
      result: { closing: false },
    });
  });

  it("[PROTOCOL-HANDSHAKE-10] 发现文件里的可执行文件已不存在：按构建标识不同处理", async () => {
    world = new World();
    const idle = await world.start();
    const client = await world.session(idle, same);
    expect(await decide(client, same, { executableExists: false })).toEqual({ action: "replace" });
    await idle.api.shutdown("user");
    world = new World();
    const busy = await world.start({ extend: () => ({ runCount: () => 1 }) });
    const busyClient = await world.session(busy, same);
    expect(await decide(busyClient, same, { executableExists: false })).toEqual({
      action: "use-outdated",
      reason: "build-differs",
    });
  });

  it("[PROTOCOL-HANDSHAKE-11] 管理进程较旧且没有运行：换新", async () => {
    world = new World();
    const handle = await world.start();
    const newer = { protocol: 2, minProtocol: 1, build: "0.0.0-test+aaaa" };
    const client = await world.session(handle, newer);
    expect(await decide(client, newer)).toEqual({ action: "replace" });
    expect(await client.request("supervisor.shutdown", UPGRADE)).toMatchObject({
      result: { closing: true },
    });
    await handle.closed;
  });

  it("[PROTOCOL-HANDSHAKE-12] 管理进程较旧、有运行、仍满足客户端的最低要求：兼容使用，不停运行", async () => {
    world = new World();
    const handle = await world.start({ extend: () => ({ runCount: () => 1 }) });
    const newer = { protocol: 2, minProtocol: 1, build: "0.0.0-test+aaaa" };
    const client = await world.session(handle, newer);
    expect(await decide(client, newer)).toEqual({
      action: "use-outdated",
      reason: "protocol-older",
    });
    expect(await client.request("ping")).toMatchObject({ ok: true });
  });

  it("[PROTOCOL-HANDSHAKE-13] 管理进程较旧、有运行、不满足最低要求：结论是 SUPERVISOR_OUTDATED，带运行个数；管理进程不动", async () => {
    world = new World();
    const handle = await world.start({ extend: () => ({ runCount: () => 3 }) });
    const newer = { protocol: 3, minProtocol: 2, build: "0.0.0-test+aaaa" };
    const client = await world.session(handle, newer);
    expect(await decide(client, newer)).toEqual({
      action: "reject",
      error: { code: "SUPERVISOR_OUTDATED", params: { runs: 3 } },
    });
    expect(await client.request("supervisor.info")).toMatchObject({ result: { runs: 3 } });
  });

  it("[PROTOCOL-HANDSHAKE-14] 客户端低于管理进程的最低要求：握手照常完成，之后每个请求都回 CLIENT_OUTDATED", async () => {
    world = new World();
    const handle = await world.start({
      identity: { ...identity, protocol: 2, minClientProtocol: 2 },
    });
    const old = { protocol: 1, minProtocol: 1, build: "0.0.0-test+aaaa" };
    const client = await world.session(handle, old);
    const response = await client.request("supervisor.info");
    expect(response).toMatchObject({ ok: false, error: { code: "CLIENT_OUTDATED", params: {} } });
    expect(await client.request("supervisor.shutdown", UPGRADE)).toMatchObject({
      error: { code: "CLIENT_OUTDATED" },
    });
    // 管理进程自己不受影响，够新的客户端照常使用
    const fresh = await world.session(handle, { protocol: 2, minProtocol: 1, build: "x" });
    expect(await fresh.request("ping")).toMatchObject({ ok: true });
  });
});
