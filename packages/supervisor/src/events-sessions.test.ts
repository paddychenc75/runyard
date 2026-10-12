import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionCloseReason } from "./session.ts";
import { World } from "./supervisor-harness.test.ts";

let world = new World();
afterEach(() => world.dispose());

const runState = { run: {} as never, at: 1, runningCount: 1 };

describe("事件订阅", () => {
  it("events.subscribe 返回 sub；同一 sub 内 seq 从 1 递增；只收订阅过的主题", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.session(handle);
    const response = (await client.request("events.subscribe", { topics: ["run"] })) as {
      result: { sub: number };
    };
    const { sub } = response.result;
    handle.api.publish("run.state", runState);
    handle.api.publish("settings.changed", {});
    handle.api.publish("run.exit", { runId: "r1" });
    expect(await client.next()).toEqual({
      t: "evt",
      sub,
      seq: 1,
      event: "run.state",
      data: runState,
    });
    expect(await client.next()).toMatchObject({ sub, seq: 2, event: "run.exit" });
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(client.pending).toBe(0);
  });

  it("run.log 不属于任何主题：订阅 run 收不到，只能经 logs.follow（#43）", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.session(handle);
    await client.request("events.subscribe", {
      topics: ["run", "playground", "toolchain", "settings"],
    });
    handle.api.publish("run.log", { at: 1, kind: "stdout", text: "x" });
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(client.pending).toBe(0);
  });

  it("多次订阅各有自己的 sub 和 seq；unsubscribe 之后不再收到，取消不存在的订阅也不报错", async () => {
    world = new World();
    const handle = await world.start();
    const client = await world.session(handle);
    const a = (
      (await client.request("events.subscribe", { topics: ["settings"] })) as {
        result: { sub: number };
      }
    ).result.sub;
    const b = (
      (await client.request("events.subscribe", { topics: ["settings"] })) as {
        result: { sub: number };
      }
    ).result.sub;
    expect(a).not.toBe(b);
    handle.api.publish("settings.changed", {});
    const first = (await client.next()) as { sub: number; seq: number };
    const second = (await client.next()) as { sub: number; seq: number };
    expect([first.sub, second.sub].sort()).toEqual([a, b].sort());
    expect([first.seq, second.seq]).toEqual([1, 1]);
    expect(await client.request("events.unsubscribe", { sub: a })).toMatchObject({
      ok: true,
      result: {},
    });
    expect(await client.request("events.unsubscribe", { sub: a })).toMatchObject({ ok: true });
    handle.api.publish("settings.changed", {});
    expect(await client.next()).toMatchObject({ sub: b, seq: 2 });
    expect(await client.request("ping")).toMatchObject({ ok: true });
    expect(client.pending).toBe(0);
  });

  it("订阅属于会话：别的会话收不到，连接关了订阅随之消失", async () => {
    world = new World();
    const handle = await world.start();
    const subscriber = await world.session(handle);
    const bystander = await world.session(handle);
    await subscriber.request("events.subscribe", { topics: ["settings"] });
    handle.api.publish("settings.changed", {});
    expect(await subscriber.next()).toMatchObject({ event: "settings.changed" });
    expect(await bystander.request("ping")).toMatchObject({ ok: true });
    expect(bystander.pending).toBe(0);
    expect(await bystander.request("events.unsubscribe", { sub: 1 })).toMatchObject({ ok: true });
  });

  it("topics 为空或含不认识的主题：USAGE", async () => {
    world = new World();
    const client = await world.session(await world.start());
    expect(await client.request("events.subscribe", { topics: [] })).toMatchObject({
      error: { code: "USAGE" },
    });
    expect(await client.request("events.subscribe", { topics: ["nope"] })).toMatchObject({
      error: { code: "USAGE" },
    });
  });

  it("慢消费者：待发字节超过上限就断开这一个连接，别的会话照常收事件", async () => {
    world = new World();
    const handle = await world.start({ maxPendingEventBytes: 64 * 1024 });
    const slow = await world.session(handle);
    const bystander = await world.session(handle);
    await slow.request("events.subscribe", { topics: ["playground"] });
    await bystander.request("events.subscribe", { topics: ["settings"] });
    slow.pause();
    const big = { blob: "x".repeat(256 * 1024) } as never;
    // 被暂停的客户端读不到 EOF，所以看服务端这边的连接数而不是客户端的 close
    for (let i = 0; i < 400 && handle.connectionCount() === 2; i++) {
      handle.api.publish("playground.changed", big);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await vi.waitFor(() => expect(handle.connectionCount()).toBe(1));
    handle.api.publish("settings.changed", {});
    expect(await bystander.next()).toMatchObject({ event: "settings.changed" });
  });
});

describe("会话", () => {
  it("[SUPERVISOR-LIFECYCLE-07] supervisor.info 说明自己是谁：协议、版本、构建标识、谁启动的、运行个数", async () => {
    world = new World();
    const client = await world.session(
      await world.start({ extend: () => ({ runCount: () => 2 }) }),
    );
    expect(await client.request("supervisor.info")).toMatchObject({
      ok: true,
      result: {
        protocol: 1,
        version: "0.0.0-test",
        build: "0.0.0-test+aaaa",
        startedBy: "cli",
        runs: 2,
      },
    });
  });

  it("session.bye：先让持有者钩子（#40）跑完，再回响应，然后关闭这一条连接", async () => {
    world = new World();
    const events: string[] = [];
    const handle = await world.start({
      extend: () => ({
        sessions: {
          onBye: async (session) => {
            events.push(`bye:${session.info?.kind}`);
          },
          onClosed: (_session, reason) => {
            events.push(`closed:${reason}`);
          },
        },
      }),
    });
    const bye = await world.session(handle, { kind: "app" });
    const other = await world.session(handle);
    expect(await bye.request("session.bye")).toMatchObject({ ok: true, result: {} });
    await bye.closed;
    expect(events).toEqual(["bye:app", "closed:bye"]);
    expect(await other.request("ping")).toMatchObject({ ok: true });
  });

  it("会话记下客户端种类、进程号和构建标识；断开（含对方崩溃）通知持有者钩子，还没握手的连接不通知", async () => {
    world = new World();
    const opened: unknown[] = [];
    const closed: Array<[number, SessionCloseReason]> = [];
    const handle = await world.start({
      extend: () => ({
        sessions: {
          onReady: (session) => opened.push(session.info),
          onClosed: (session, reason) => closed.push([session.id, reason]),
        },
      }),
    });
    const half = await world.connect();
    await half.readChallenge();
    const client = await world.session(handle, { kind: "app", pid: 4242, build: "client-build" });
    expect(opened).toEqual([{ id: 2, kind: "app", pid: 4242, build: "client-build" }]);
    client.destroy();
    await vi.waitFor(() => expect(closed).toEqual([[2, "peer-closed"]]));
    half.destroy();
    await vi.waitFor(() => expect(handle.connectionCount()).toBe(0));
    expect(closed).toHaveLength(1);
  });

  it("一个连接一个会话：同一进程开两个连接是两个会话", async () => {
    world = new World();
    const handle = await world.start();
    await world.session(handle);
    await world.session(handle);
    expect(handle.api.readySessions().map((s) => s.id)).toEqual([1, 2]);
  });
});
