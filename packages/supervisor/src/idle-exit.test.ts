import { afterEach, describe, expect, it, vi } from "vitest";
import { World } from "./supervisor-harness.test.ts";

let world = new World();
afterEach(() => world.dispose());

const IDLE = 60_000;

describe("空闲退出", () => {
  it("[SUPERVISOR-LIFECYCLE-12] 没有连接也没有运行满 60 秒：退出，发现文件和连接点被释放", async () => {
    world = new World();
    const handle = await world.start();
    await world.clock.advance(IDLE - 1);
    expect(world.discovery.file).toBeDefined();
    await world.clock.advance(1);
    await handle.closed;
    expect(world.discovery.file).toBeUndefined();
    await expect(world.fake.platform.ipc.connect(200)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
    // 锁已放：同一个现场可以再起一个
    expect((await world.start()).token).toBeTruthy();
  });

  it("[SUPERVISOR-LIFECYCLE-13] 没有连接但有运行：60 秒后仍然存活，运行没了才重新计时", async () => {
    world = new World();
    let runs = 1;
    const handle = await world.start({ extend: () => ({ runCount: () => runs }) });
    let closed = false;
    void handle.closed.then(() => {
      closed = true;
    });
    await world.clock.advance(IDLE * 3);
    expect(closed).toBe(false);
    runs = 0;
    handle.api.notifyRunsChanged();
    await world.clock.advance(IDLE - 1);
    expect(closed).toBe(false);
    await world.clock.advance(1);
    await handle.closed;
  });

  it("[SUPERVISOR-LIFECYCLE-14] 过了 59 秒来了一个连接：不退出，连接走后从零重新计时", async () => {
    world = new World();
    const handle = await world.start();
    let closed = false;
    void handle.closed.then(() => {
      closed = true;
    });
    await world.clock.advance(IDLE - 1_000);
    const client = await world.session(handle);
    // 有连接的时候过多久都不退出
    await world.clock.advance(IDLE * 5);
    expect(closed).toBe(false);
    client.destroy();
    // 服务端发现连接断了才开始计时；等它真的发现，而不是赌几轮事件循环
    await vi.waitFor(() => expect(handle.connectionCount()).toBe(0));
    await world.clock.advance(IDLE - 1);
    expect(closed).toBe(false);
    await world.clock.advance(1);
    await handle.closed;
    expect(closed).toBe(true);
  });

  it("还没握手完成的连接也算连接：不会在握手窗口里被空闲计时收掉", async () => {
    world = new World();
    const handle = await world.start();
    await world.clock.advance(IDLE - 1_000);
    const half = await world.connect();
    await half.readChallenge();
    expect(handle.connectionCount()).toBe(1);
    await world.clock.advance(2_000);
    // 握手窗口（5 秒）还没到，连接还在，所以没有退出
    expect(world.discovery.file).toBeDefined();
  });

  it("关闭之后不再因为空闲重复关闭：重复的 shutdown 是同一个 Promise", async () => {
    world = new World();
    const handle = await world.start();
    const first = handle.api.shutdown("user");
    expect(handle.api.shutdown("user")).toBe(first);
    await first;
    expect(world.clock.pendingTimers()).toBe(0);
  });
});
