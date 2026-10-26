import { afterEach, describe, expect, it, vi } from "vitest";
import { cliOwner, LibraryWorld } from "./library-harness.test.ts";

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

async function setup(options: { subscribe?: boolean } = {}) {
  lw = new LibraryWorld();
  await lw.start();
  const app = await lw.client(options.subscribe ?? true);
  const created = await lw.create(app, "demo");
  return { app, id: created.playground.id };
}

describe("改名与移到废纸篓的释放顺序", () => {
  it("[LIBRARY-PLAYGROUNDS-16] 一个客户端不回报：等满 3 秒才继续，记一行日志，改名照常完成", async () => {
    const { app } = await setup();
    let finished = false;
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo2" });
    void pending.then(() => {
      finished = true;
    });
    await app.waitForEvent("playground.releaseRequested");
    await lw.clock.advance(2999);
    expect(finished).toBe(false);
    expect(lw.fs.exists(lw.at("demo"))).toBe(true);
    await lw.clock.advance(1);
    expect(await pending).toMatchObject({ ok: true });
    expect(lw.fs.exists(lw.at("demo2"))).toBe(true);
    expect(lw.logs.filter((line) => line.startsWith("release timeout"))).toHaveLength(1);
  });

  it("[LIBRARY-PLAYGROUNDS-17] 所有客户端都回报了：不等满 3 秒，立即继续", async () => {
    const { app, id } = await setup();
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo2" });
    const requested = await app.waitForEvent("playground.releaseRequested");
    expect(requested).toEqual({ playgroundId: id, reason: "rename" });
    await app.call("playground.released", { playgroundId: id });
    expect(await pending).toMatchObject({ ok: true });
    // 3 秒的等待计时器已清掉；剩下的一个是磁盘占用每 30 分钟复核的计时器
    expect(lw.clock.pendingTimers()).toBe(1);
    expect(lw.logs.some((line) => line.startsWith("release timeout"))).toBe(false);
  });

  it("没有订阅 playground 主题的连接（命令行）收不到请求，也不会被等：订阅的客户端回报后立即继续", async () => {
    const { app, id } = await setup();
    const cli = await lw.client(false);
    const pending = cli.call("playground.rename", { playground: "demo", newName: "demo2" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: id });
    expect(await pending).toMatchObject({ ok: true });
    expect(cli.eventsOf("playground.releaseRequested")).toEqual([]);
    // 3 秒的等待计时器已清掉；剩下的一个是磁盘占用每 30 分钟复核的计时器
    expect(lw.clock.pendingTimers()).toBe(1);
  });

  it("等待期间连接断开的客户端不再等", async () => {
    const { id } = await setup();
    const other = await lw.client(true);
    const cli = await lw.client(false);
    const pending = cli.call("playground.trash", { playground: "demo" });
    await other.waitForEvent("playground.releaseRequested");
    other.client.destroy();
    const first = lw.pumps[0];
    await first?.call("playground.released", { playgroundId: id });
    await lw.clock.advance(0);
    expect(await pending).toMatchObject({ ok: true });
    expect(lw.logs.some((line) => line.startsWith("release timeout"))).toBe(false);
  });

  it("[DESKTOP-TERMINAL-38] 在项目自己的终端里 runyard rm：释放时应用结束终端，请求的命令行进程跟着没了，移到废纸篓照样完整做完", async () => {
    const { app, id } = await setup();
    const cli = await lw.client(false);
    void cli.call("playground.trash", { playground: "demo" }).catch(() => undefined);
    await app.waitForEvent("playground.releaseRequested");
    // 应用结束 demo 的终端，里面正在等结果的 runyard rm 随终端一起被结束，连接断开
    cli.client.destroy();
    await app.call("playground.released", { playgroundId: id });
    await lw.clock.advance(0);
    // 项目完整地进了废纸篓、也不在资源库里：没有半途而废
    await vi.waitFor(() =>
      expect(lw.fs.trashed.map((entry) => entry.path)).toEqual([lw.at("demo")]),
    );
    expect(await app.result("playground.list", {})).toEqual([]);
  });

  it("[LIBRARY-PLAYGROUNDS-14] 改名正在运行的项目：先停止，再请释放，改名后用同一个持有者重新启动", async () => {
    const { app, id } = await setup();
    lw.runs.active.set(id, cliOwner);
    lw.runs.onStop = () => {
      lw.runs.calls.push(`released-so-far:${app.eventsOf("playground.releaseRequested").length}`);
    };
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo2" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: id });
    const response = await pending;
    expect(response).toMatchObject({ ok: true, result: { name: "demo2", id } });
    // 停止发生在广播之前；重新启动发生在改名之后，持有者不变
    expect(lw.runs.calls).toEqual([`stop:${id}`, "released-so-far:0", `start:${id}`]);
    expect(lw.runs.active.get(id)).toEqual(cliOwner);
    expect(lw.fs.exists(lw.at("demo2"))).toBe(true);
  });

  it("没有在运行的项目改名后不会被启动", async () => {
    const { app, id } = await setup();
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo2" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: id });
    await pending;
    expect(lw.runs.calls).toEqual([`stop:${id}`]);
  });

  it("[LIBRARY-PLAYGROUNDS-13] 改名到保留名：NAME_RESERVED，运行没有被停止，也没有发出释放请求", async () => {
    const { app, id } = await setup();
    lw.runs.active.set(id, cliOwner);
    expect(await app.errorCode("playground.rename", { playground: "demo", newName: "nul" })).toBe(
      "NAME_RESERVED",
    );
    expect(lw.runs.calls).toEqual([]);
    expect(app.eventsOf("playground.releaseRequested")).toEqual([]);
    expect(lw.fs.exists(lw.at("demo"))).toBe(true);
  });

  it("[LIBRARY-PLAYGROUNDS-15] 安装中不能改名：BUSY，没有任何改动", async () => {
    const { app, id } = await setup();
    lw.runs.active.set(id, cliOwner);
    lw.runs.busy.add(id);
    expect(await app.errorCode("playground.rename", { playground: "demo", newName: "demo2" })).toBe(
      "BUSY",
    );
    expect(lw.runs.calls).toEqual([]);
    expect(lw.fs.exists(lw.at("demo"))).toBe(true);
  });

  it("[LIBRARY-PLAYGROUNDS-32] 平台层改名因占用失败：PATH_LOCKED，文件夹仍叫原名", async () => {
    const { app, id } = await setup();
    lw.fs.lock(lw.at("demo"));
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo2" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: id });
    expect(await pending).toMatchObject({ ok: false, error: { code: "PATH_LOCKED" } });
    expect(lw.fs.exists(lw.at("demo", ".runyard", "playground.json"))).toBe(true);
  });

  it("[LIBRARY-PLAYGROUNDS-19] 移到废纸篓：先停止运行，再释放，文件夹进废纸篓，资源库里不再有它", async () => {
    const { app, id } = await setup();
    lw.runs.active.set(id, cliOwner);
    const pending = app.call("playground.trash", { playground: "demo" });
    expect(await app.waitForEvent("playground.releaseRequested")).toEqual({
      playgroundId: id,
      reason: "trash",
    });
    expect(lw.runs.calls).toEqual([`stop:${id}`]);
    await app.call("playground.released", { playgroundId: id });
    expect(await pending).toMatchObject({ ok: true, result: { trashed: true } });
    expect(lw.fs.trashed.map((entry) => entry.path)).toEqual([lw.at("demo")]);
    expect(await app.result("playground.list", {})).toEqual([]);
    expect(await app.waitForEvent("playground.removed")).toEqual({ playgroundId: id });
  });

  it("[LIBRARY-PLAYGROUNDS-31] 废纸篓不可用：TRASH_UNAVAILABLE，项目仍在资源库里，没有任何内容被删除", async () => {
    const { app, id } = await setup();
    lw.fs.failTrash();
    const pending = app.call("playground.trash", { playground: "demo" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: id });
    expect(await pending).toMatchObject({ ok: false, error: { code: "TRASH_UNAVAILABLE" } });
    expect(lw.fs.exists(lw.at("demo", ".runyard", "playground.json"))).toBe(true);
    expect(await app.result<unknown[]>("playground.list", {})).toHaveLength(1);
  });
});
