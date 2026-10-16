import { afterEach, describe, expect, it } from "vitest";

const DAY = 24 * 60 * 60 * 1000;

import { LibraryWorld } from "./library-harness.test.ts";

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

async function setup(days = 7) {
  lw = new LibraryWorld();
  await lw.start();
  const app = await lw.client();
  const { playground } = await lw.create(app, "demo", { autoClean: days });
  return { app, id: playground.id };
}

type Due = { remind: string[]; clean: string[] };

describe("clean.* 方法接上资源库", () => {
  it("[LIBRARY-AUTO-CLEAN-15] 到期前一天进入待提醒，clean.due 不带参数", async () => {
    const { app, id } = await setup(7);
    await lw.clock.advance(5 * DAY);
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [], clean: [] });
    await lw.clock.advance(DAY + 1000);
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [id], clean: [] });
  });

  it("[LIBRARY-AUTO-CLEAN-17] ackReminder 记下显示时间，之后不再待提醒；满一天后进入可清理", async () => {
    const { app, id } = await setup(7);
    await lw.clock.advance(6.5 * DAY);
    await app.result("clean.ackReminder", { playgroundId: id });
    expect((await app.result<Due>("clean.due", {})).remind).toEqual([]);
    await lw.clock.advance(DAY);
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [], clean: [id] });
  });

  it("[LIBRARY-AUTO-CLEAN-18] clean.keep：项目变为已保留，提醒状态清除，发出 playground.changed", async () => {
    const { app, id } = await setup(7);
    await lw.clock.advance(6.5 * DAY);
    await app.result("clean.keep", { playgroundId: id });
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [], clean: [] });
    const pg = await app.result<{ autoClean: unknown }>("playground.get", { playground: id });
    expect(pg.autoClean).toEqual({ enabled: false });
    expect(await app.waitForEvent("playground.changed")).toMatchObject({ id });
  });

  it("[LIBRARY-AUTO-CLEAN-25] 正在运行的项目不进可清理清单（顺延）；[LIBRARY-AUTO-CLEAN-26] 开着标签页即有运行，同样顺延", async () => {
    const { app, id } = await setup(7);
    await lw.clock.advance(6.5 * DAY);
    await app.result("clean.ackReminder", { playgroundId: id });
    await lw.clock.advance(DAY);
    lw.runs.active.set(id, { kind: "tab", clientId: "c1", tabId: "t1" });
    expect((await app.result<Due>("clean.due", {})).clean).toEqual([]);
    lw.runs.active.delete(id);
    // 顺延一天后才再判断
    expect((await app.result<Due>("clean.due", {})).clean).toEqual([]);
    await lw.clock.advance(DAY + 1000);
    expect((await app.result<Due>("clean.due", {})).clean).toEqual([id]);
  });

  it("[LIBRARY-AUTO-CLEAN-28] 找不到文件夹的项目不在两份清单里；[LIBRARY-AUTO-CLEAN-29] 根目录不在时两份都是空的", async () => {
    const { app } = await setup(7);
    await lw.clock.advance(30 * DAY);
    lw.fs.remove(lw.at("demo"));
    await app.result("library.rescan", {});
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [], clean: [] });
    lw.fs.remove(lw.root);
    expect(await app.result<Due>("clean.due", {})).toEqual({ remind: [], clean: [] });
  });

  it("clean.ackReminder / clean.keep 对不存在的项目报 PLAYGROUND_NOT_FOUND", async () => {
    const { app } = await setup();
    expect(await app.errorCode("clean.ackReminder", { playgroundId: "nope" })).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
    expect(await app.errorCode("clean.keep", { playgroundId: "nope" })).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
  });
});
