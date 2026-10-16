import { afterEach, describe, expect, it } from "vitest";
import { isClientError } from "./client-error.ts";
import { disposeWorlds, World } from "./client-harness.test.ts";
import { connectSupervisor } from "./connect-supervisor.ts";
import type { ClientEvent } from "./runyard-client.ts";
import type { TestSupervisorOptions } from "./test-supervisor.ts";

afterEach(disposeWorlds);

async function connected(options: Omit<TestSupervisorOptions, "platform"> = {}) {
  const world = new World();
  await world.makeExecutable("/fake/node");
  const supervisor = await world.supervisor(options);
  await supervisor.publishDiscovery();
  const diagnostics: string[] = [];
  const client = await connectSupervisor(
    world.options({ onDiagnostic: (l) => diagnostics.push(l) }),
  );
  return { world, supervisor, client, diagnostics };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isClientError(error)) return error;
    throw error;
  }
  throw new Error("expected a ClientError");
}

const nextTurns = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("带类型的调用", () => {
  it("call 返回按登记表校验过的出参，supervisor 的自我介绍随连接带回", async () => {
    const { client } = await connected({ version: "1.2.3", runs: 0 });
    expect(client.supervisor).toMatchObject({
      version: "1.2.3",
      protocol: 1,
      startedBy: "cli",
      runs: 0,
    });
    const info = await client.call("supervisor.info", {});
    expect(info.build).toBe("1.0.0+aaaa");
    client.close();
  });

  it("管理进程返回登记过的错误码：抛 ClientError，code 和 params 原样带着", async () => {
    const { client } = await connected({
      respond: (method) =>
        method === "ping"
          ? { error: { code: "NAME_EXISTS", params: { name: "demo" }, debug: "exists" } }
          : undefined,
    });
    const error = await failure(client.call("ping", {}));
    expect(error.known).toEqual({ code: "NAME_EXISTS", params: { name: "demo" }, debug: "exists" });
    client.close();
  });

  it("[PROTOCOL-HANDSHAKE-17] 新版管理进程返回旧客户端没登记的错误码：照样抛出，带原始 code 和 params，known 为空", async () => {
    const { client } = await connected({
      respond: (method) =>
        method === "ping"
          ? { error: { code: "FUTURE_THING", params: { x: 1 }, debug: "only for logs" } }
          : undefined,
    });
    const error = await failure(client.call("ping", {}));
    expect(error.code).toBe("FUTURE_THING");
    expect(error.error.params).toEqual({ x: 1 });
    expect(error.known).toBeUndefined();
    // 之后的请求不受影响
    const { client: other } = await connected();
    await expect(other.call("ping", {})).resolves.toEqual({});
    client.close();
    other.close();
  });

  it("出参不符合登记表：INTERNAL，不把半个结果交给调用方", async () => {
    let infoCalls = 0;
    const { client } = await connected({
      // 第一次 supervisor.info 是连接时的版本比对，要正常；之后的坏掉
      respond: (method) => {
        if (method !== "supervisor.info") return undefined;
        infoCalls += 1;
        return infoCalls === 1 ? undefined : { result: { nope: 1 } };
      },
    });
    const error = await failure(client.call("supervisor.info", {}));
    expect(error.code).toBe("INTERNAL");
    client.close();
  });

  it("请求等待期间连接断了：SUPERVISOR_UNAVAILABLE", async () => {
    const { client, supervisor } = await connected({
      respond: (method) => (method === "ping" ? "hang" : undefined),
    });
    const pending = failure(client.call("ping", {}));
    await nextTurns();
    supervisor.dropConnections();
    expect((await pending).code).toBe("SUPERVISOR_UNAVAILABLE");
    await client.closed;
    // 断开之后再调用同样是 SUPERVISOR_UNAVAILABLE
    expect((await failure(client.call("ping", {}))).code).toBe("SUPERVISOR_UNAVAILABLE");
  });
});

describe("事件订阅", () => {
  it("紧跟在订阅响应后面（同一次到达）的事件也能收到，data 按登记表校验", async () => {
    const { client } = await connected({
      eventsRightAfterSubscribe: [
        { seq: 1, event: "playground.removed", data: { playgroundId: "p1" } },
        { seq: 2, event: "playground.removed", data: { playgroundId: "p2" } },
      ],
    });
    const seen: ClientEvent[] = [];
    await client.subscribe(["playground"], (event) => seen.push(event));
    await nextTurns();
    expect(seen).toEqual([
      { event: "playground.removed", data: { playgroundId: "p1" }, seq: 1, gap: false },
      { event: "playground.removed", data: { playgroundId: "p2" }, seq: 2, gap: false },
    ]);
    client.close();
  });

  it("seq 跳号时标 gap，提醒调用方重读快照", async () => {
    const { client } = await connected({
      eventsRightAfterSubscribe: [
        { seq: 1, event: "playground.removed", data: { playgroundId: "p1" } },
        { seq: 3, event: "playground.removed", data: { playgroundId: "p3" } },
      ],
    });
    const gaps: boolean[] = [];
    await client.subscribe(["playground"], (event) => gaps.push(event.gap));
    await nextTurns();
    expect(gaps).toEqual([false, true]);
    client.close();
  });

  it("不认识的事件名和形状不对的事件：丢弃并写一行诊断，不影响后面的", async () => {
    const { client, diagnostics } = await connected({
      eventsRightAfterSubscribe: [
        { seq: 1, event: "future.thing", data: {} },
        { seq: 2, event: "playground.removed", data: { wrong: true } },
        { seq: 3, event: "playground.removed", data: { playgroundId: "ok" } },
      ],
    });
    const seen: string[] = [];
    await client.subscribe(["playground"], (event) => seen.push(event.event));
    await nextTurns();
    expect(seen).toEqual(["playground.removed"]);
    expect(diagnostics).toHaveLength(2);
    client.close();
  });

  it("followLogs 登记 logs.follow 的订阅：紧跟响应的 run.log 条目收得到，取消走 events.unsubscribe", async () => {
    const entry = { at: 1, kind: "stdout", text: "hello" };
    const { client, supervisor } = await connected({
      eventsRightAfterSubscribe: [{ seq: 1, event: "run.log", data: entry }],
    });
    const seen: ClientEvent[] = [];
    const subscription = await client.followLogs({ playground: "demo" }, (event) =>
      seen.push(event),
    );
    await nextTurns();
    expect(supervisor.requests.at(-1)).toEqual({
      method: "logs.follow",
      params: { playground: "demo" },
    });
    expect(seen).toEqual([{ event: "run.log", data: entry, seq: 1, gap: false }]);
    await subscription.unsubscribe();
    expect(supervisor.requests.at(-1)).toEqual({
      method: "events.unsubscribe",
      params: { sub: subscription.sub },
    });
    client.close();
  });

  it("取消订阅会通知管理进程，之后同一个 sub 的事件不再交给监听者", async () => {
    const { client, supervisor } = await connected();
    const seen: ClientEvent[] = [];
    const subscription = await client.subscribe(["run"], (event) => seen.push(event));
    await subscription.unsubscribe();
    expect(supervisor.requests.at(-1)).toEqual({
      method: "events.unsubscribe",
      params: { sub: subscription.sub },
    });
    supervisor.pushEvent(0, subscription.sub, 1, "playground.removed", { playgroundId: "late" });
    await nextTurns();
    expect(seen).toEqual([]);
    client.close();
  });
});
