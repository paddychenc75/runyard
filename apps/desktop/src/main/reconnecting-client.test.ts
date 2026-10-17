import type { ClientEvent, EventListener } from "@runyard/client";
import { describe, expect, it } from "vitest";
import { type LiveClient, ReconnectingClient } from "./reconnecting-client.ts";

// 假的底层连接：能手动断开，记下调用和订阅
class FakeLive {
  readonly calls: string[] = [];
  readonly listeners: EventListener[] = [];
  readonly topics: string[][] = [];
  #end: () => void = () => {};
  readonly closed = new Promise<void>((resolve) => {
    this.#end = resolve;
  });
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  async call(method: string): Promise<unknown> {
    this.calls.push(method);
    return { from: this.name };
  }
  async subscribe(topics: string[], listener: EventListener) {
    this.topics.push(topics);
    this.listeners.push(listener);
    return { sub: this.listeners.length, unsubscribe: async () => {} };
  }
  async followLogs(_params: unknown, listener: EventListener) {
    this.listeners.push(listener);
    return { sub: this.listeners.length, unsubscribe: async () => {} };
  }
  close(): void {
    this.#end();
  }
  drop(): void {
    this.#end();
  }
}

const live = (fake: FakeLive) => fake as unknown as LiveClient;
const event = (seq: number): ClientEvent =>
  ({ event: "playground.changed", data: {}, seq, gap: false }) as unknown as ClientEvent;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(outcomes: Array<FakeLive | Error>) {
  const first = new FakeLive("first");
  const slept: number[] = [];
  let reconnected = 0;
  const connects: number[] = [];
  const client = new ReconnectingClient(live(first), {
    connect: async () => {
      connects.push(connects.length);
      const next = outcomes.shift();
      if (next === undefined || next instanceof Error) throw next ?? new Error("none");
      return live(next);
    },
    onReconnected: () => {
      reconnected++;
    },
    retryDelaysMs: [10, 20],
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  return { first, client, slept, connects, outcomes, reconnected: () => reconnected };
}

describe("应用对管理进程的重连（#358）", () => {
  it("连接断开（管理进程被换掉或重启）后自动重连、重新订阅，并通知重读状态；新连接的第一条事件标 gap", async () => {
    const second = new FakeLive("second");
    const { first, client, reconnected } = setup([second]);
    const seen: ClientEvent[] = [];
    await client.subscribe(["run", "playground"], (e) => seen.push(e));
    first.drop();
    await settle();
    await settle();
    expect(second.topics).toEqual([["run", "playground"]]);
    expect(reconnected()).toBe(1);
    second.listeners[0]?.(event(1));
    second.listeners[0]?.(event(2));
    expect(seen.map((e) => e.gap)).toEqual([true, false]);
    // 之后的调用走新连接
    expect(await client.call("ping", {})).toEqual({ from: "second" });
  });

  it("断开期间的调用等重连完成后在新连接上执行，不是直接失败", async () => {
    const second = new FakeLive("second");
    const { first, client } = setup([second]);
    first.drop();
    await settle();
    await expect(client.call("settings.get", {})).resolves.toEqual({ from: "second" });
    expect(first.calls).toEqual([]);
  });

  it("连不上时按间隔重试，连上为止", async () => {
    const second = new FakeLive("second");
    const { first, client, slept, connects, reconnected } = setup([
      new Error("a"),
      new Error("b"),
      second,
    ]);
    first.drop();
    await settle();
    await expect(client.call("ping", {})).resolves.toEqual({ from: "second" });
    expect(slept).toEqual([10, 20]);
    expect(connects.length).toBe(3);
    expect(reconnected()).toBe(1);
  });

  it("重试用完仍连不上：调用报 SUPERVISOR_UNAVAILABLE；之后管理进程可连了，下一次调用再起一轮并连上", async () => {
    const second = new FakeLive("second");
    const { first, client, outcomes } = setup([new Error("a"), new Error("b"), new Error("c")]);
    first.drop();
    await settle();
    await expect(client.call("ping", {})).rejects.toMatchObject({
      code: "SUPERVISOR_UNAVAILABLE",
    });
    outcomes.push(second);
    await expect(client.call("ping", {})).resolves.toEqual({ from: "second" });
  });

  it("应用退出道别之后的断开不重连（不会把管理进程再拉起来）", async () => {
    const { first, client, connects } = setup([new FakeLive("second")]);
    client.stopReconnecting();
    first.drop();
    await settle();
    await settle();
    expect(connects).toEqual([]);
  });

  it("日志订阅也会在重连后重新订阅", async () => {
    const second = new FakeLive("second");
    const { first, client } = setup([second]);
    const seen: ClientEvent[] = [];
    await client.followLogs({ playground: "p" } as never, (e) => seen.push(e));
    first.drop();
    await settle();
    await settle();
    second.listeners[0]?.(event(1));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.gap).toBe(true);
  });
});
