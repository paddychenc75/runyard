import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { platformError } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { DAY_MS } from "./auto-clean.ts";
import { isLibraryError } from "./library-error.ts";
import { createLibraryHarness, seedOf, user } from "./library-harness.test.ts";

async function setup(names: string[] = ["demo"]) {
  const h = createLibraryHarness();
  const library = await h.open();
  for (const name of names) {
    await library.create(seedOf("react19", { "a.txt": name }), { name, createdBy: user });
  }
  return { h, library };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isLibraryError(error) ? error.error.code : "NOT_A_LIBRARY_ERROR";
  }
  return undefined;
}

const idle = { isBusy: () => false, beforeMove: async () => {} };

describe("改名", () => {
  it("[LIBRARY-PLAYGROUNDS-13] 改名到保留名：NAME_RESERVED，没有调用停止，文件夹名没变", async () => {
    const { h, library } = await setup();
    let stopped = false;
    const code = await codeOf(
      library.rename("demo", "nul", {
        isBusy: () => false,
        beforeMove: async () => {
          stopped = true;
        },
      }),
    );
    expect(code).toBe("NAME_RESERVED");
    expect(stopped).toBe(false);
    expect(h.fs.exists(h.at("demo"))).toBe(true);
    expect(library.find("demo")).toBeDefined();
  });

  it("[LIBRARY-PLAYGROUNDS-14] 改名：先走停止与释放，再改文件夹；端口和其他设置不变，索引落盘", async () => {
    const { h, library } = await setup();
    const before = library.find("demo")?.entry;
    const order: string[] = [];
    const result = await library.rename("demo", "demo2", {
      isBusy: () => false,
      beforeMove: async () => {
        // 此刻文件夹还在原处
        order.push(`release:${h.fs.exists(h.at("demo"))}`);
      },
    });
    expect(order).toEqual(["release:true"]);
    expect(h.fs.exists(h.at("demo"))).toBe(false);
    expect(h.fs.readFile(h.at("demo2", "a.txt"))).toBe("demo");
    expect(result.after.name).toBe("demo2");
    expect(result.after.entry).toEqual({ ...before, path: h.at("demo2") });
    expect(library.find("demo")).toBeUndefined();
    const index = h.readJson(h.indexPath) as { playgrounds: { path: string; port: number }[] };
    expect(index.playgrounds.map((p) => [p.path, p.port])).toEqual([[h.at("demo2"), before?.port]]);
  });

  it("[LIBRARY-PLAYGROUNDS-15] 安装中或启动中：BUSY，没有任何改动", async () => {
    const { h, library } = await setup();
    let moved = false;
    const code = await codeOf(
      library.rename("demo", "demo2", {
        isBusy: () => true,
        beforeMove: async () => {
          moved = true;
        },
      }),
    );
    expect(code).toBe("BUSY");
    expect(moved).toBe(false);
    expect(h.fs.exists(h.at("demo"))).toBe(true);
    expect(library.find("demo2")).toBeUndefined();
  });

  it("[LIBRARY-PLAYGROUNDS-12] 新名称已被占用：NAME_EXISTS，不停止、不覆盖", async () => {
    const { h, library } = await setup(["demo", "other"]);
    let called = false;
    const code = await codeOf(
      library.rename("demo", "other", {
        isBusy: () => false,
        beforeMove: async () => {
          called = true;
        },
      }),
    );
    expect(code).toBe("NAME_EXISTS");
    expect(called).toBe(false);
    expect(h.fs.readFile(h.at("other", "a.txt"))).toBe("other");
  });

  it("名称不合法：NAME_INVALID", async () => {
    const { library } = await setup();
    expect(await codeOf(library.rename("demo", "Bad Name", idle))).toBe("NAME_INVALID");
  });

  it("找不到文件夹的项目不能改名：FOLDER_MISSING", async () => {
    const { h, library } = await setup();
    h.fs.remove(h.at("demo"));
    await library.rescan();
    expect(await codeOf(library.rename("demo", "demo2", idle))).toBe("FOLDER_MISSING");
  });

  it("[LIBRARY-PLAYGROUNDS-32] 平台层改名因占用失败：PATH_LOCKED，文件夹仍叫原名，内容完好，索引不变", async () => {
    const { h, library } = await setup();
    const before = library.find("demo")?.entry;
    h.fs.lock(h.at("demo"));
    expect(await codeOf(library.rename("demo", "demo2", idle))).toBe("PATH_LOCKED");
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("demo");
    expect(h.fs.exists(h.at("demo2"))).toBe(false);
    expect(library.find("demo")?.entry).toEqual(before);
  });
});

describe("移到废纸篓", () => {
  it("[LIBRARY-PLAYGROUNDS-19] 先走停止与释放，再进废纸篓；资源库里不再有它，索引落盘", async () => {
    const { h, library } = await setup();
    const seen: boolean[] = [];
    const outcome = await library.trash("demo", {
      beforeMove: async () => {
        seen.push(h.fs.trashed.length === 0 && h.fs.exists(h.at("demo")));
      },
    });
    expect(seen).toEqual([true]);
    expect(h.fs.trashed.map((t) => t.path)).toEqual([h.at("demo")]);
    expect(h.fs.exists(h.at("demo"))).toBe(false);
    expect(library.find("demo")).toBeUndefined();
    expect(outcome.restorable).toBe(true);
    expect(outcome.removed.name).toBe("demo");
    expect((h.readJson(h.indexPath) as { playgrounds: unknown[] }).playgrounds).toEqual([]);
  });

  it("[LIBRARY-PLAYGROUNDS-20] 废纸篓里已有同名项目：两个都在，先前那个没被覆盖", async () => {
    const { h, library } = await setup();
    await library.trash("demo", idle);
    await library.create(seedOf("react19", { "a.txt": "second" }), {
      name: "demo",
      createdBy: user,
    });
    await library.trash("demo", idle);
    expect(h.fs.trashed).toHaveLength(2);
    const contents = h.fs.trashed.map((t) => t.files.some((f) => f.endsWith("a.txt")));
    expect(contents).toEqual([true, true]);
  });

  it("[LIBRARY-PLAYGROUNDS-31] 废纸篓不可用：TRASH_UNAVAILABLE，文件夹和索引原样保留", async () => {
    const { h, library } = await setup();
    const before = library.find("demo")?.entry;
    h.fs.failTrash();
    expect(await codeOf(library.trash("demo", idle))).toBe("TRASH_UNAVAILABLE");
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("demo");
    expect(h.fs.trashed).toEqual([]);
    expect(library.find("demo")?.entry).toEqual(before);
  });

  it("找不到文件夹的项目：FOLDER_MISSING；没有的项目：PLAYGROUND_NOT_FOUND", async () => {
    const { h, library } = await setup();
    expect(await codeOf(library.trash("nope", idle))).toBe("PLAYGROUND_NOT_FOUND");
    h.fs.remove(h.at("demo"));
    await library.rescan();
    expect(await codeOf(library.trash("demo", idle))).toBe("FOLDER_MISSING");
  });

  it("[LIBRARY-PLAYGROUNDS-24] 资源库代码里没有永久删除的调用", () => {
    const banned = /\b(rmSync|rmdir|rmdirSync|unlink|unlinkSync|fs\.rm|rm\()/;
    const dir = import.meta.dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      expect({ file, hit: banned.exec(text)?.[0] }).toEqual({ file, hit: undefined });
    }
  });
});

describe("自动清理的计时与一轮检查", () => {
  const days = (n: number) => n * DAY_MS;
  const none = new Set<string>();

  async function autoCleanSetup(daysValue: number) {
    const s = await setup();
    await s.library.setAutoClean("demo", daysValue);
    return s;
  }

  it("[LIBRARY-AUTO-CLEAN-07] 给 100 天没用的已保留项目打开自动清理：从打开那刻起算", async () => {
    const { h, library } = await setup();
    await h.clock.advance(days(100));
    await library.setAutoClean("demo", 30);
    expect(library.find("demo")?.entry.lastUsedAt).toBe(h.clock.now());
    expect(h.readJson(h.at("demo", ".runyard", "playground.json")).autoClean).toEqual({
      enabled: true,
      days: 30,
    });
    const verdict = await library.checkAutoClean(none);
    expect(verdict.remind).toEqual([]);
    expect(verdict.clean).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-05] 改回已保留：提醒状态清除，两份清单都没有", async () => {
    const { h, library } = await autoCleanSetup(14);
    await h.clock.advance(days(14));
    await library.ackReminder("demo");
    expect(library.find("demo")?.entry.clean?.remindedAt).toBe(h.clock.now());
    await library.keep("demo");
    expect(library.find("demo")?.entry.clean).toBeUndefined();
    expect(h.readJson(h.at("demo", ".runyard", "playground.json")).autoClean).toEqual({
      enabled: false,
    });
    await h.clock.advance(days(400));
    const verdict = await library.checkAutoClean(none);
    expect([...verdict.remind, ...verdict.clean]).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-18] 一键改为保留后两份清单里都没有它", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(8));
    expect((await library.checkAutoClean(none)).remind).toHaveLength(1);
    await library.ackReminder("demo");
    await h.clock.advance(days(1));
    expect((await library.checkAutoClean(none)).clean).toHaveLength(1);
    await library.keep("demo");
    const verdict = await library.checkAutoClean(none);
    expect([...verdict.remind, ...verdict.clean]).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-16] 没确认显示就不记：下一轮仍在待提醒清单里，不会被清理", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(8));
    for (let i = 0; i < 3; i++) {
      const verdict = await library.checkAutoClean(none);
      expect(verdict.remind).toHaveLength(1);
      expect(verdict.clean).toEqual([]);
      await h.clock.advance(days(2));
    }
    expect(library.find("demo")?.entry.clean).toBeUndefined();
  });

  it("[LIBRARY-AUTO-CLEAN-17] 确认显示后记下时间，之后不再进入待提醒清单", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(6) + 1);
    const id = library.find("demo")?.entry.id as string;
    expect((await library.checkAutoClean(none)).remind).toEqual([id]);
    await library.ackReminder("demo");
    expect((await library.checkAutoClean(none)).remind).toEqual([]);
    expect(library.find("demo")?.entry.clean?.remindedAt).toBe(h.clock.now());
  });

  it("[LIBRARY-AUTO-CLEAN-09] 使用一次：计时重新开始；[LIBRARY-AUTO-CLEAN-14] 并清除已显示的提醒", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(6) + 1);
    await library.ackReminder("demo");
    await h.clock.advance(days(1));
    await library.markUsed("demo");
    const entry = library.find("demo")?.entry;
    expect(entry?.lastUsedAt).toBe(h.clock.now());
    expect(entry?.clean).toBeUndefined();
    const verdict = await library.checkAutoClean(none);
    expect([...verdict.remind, ...verdict.clean]).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-23] 提醒满 24 小时后又用了一次：不在可清理清单里", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(8));
    await library.ackReminder("demo");
    await h.clock.advance(days(1));
    expect((await library.checkAutoClean(none)).clean).toHaveLength(1);
    await library.markUsed("demo");
    expect((await library.checkAutoClean(none)).clean).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-11] 只读操作（列出、查找、检查）不改上次使用时间；[LIBRARY-AUTO-CLEAN-12] 打开但不运行同理", async () => {
    const { h, library } = await autoCleanSetup(7);
    const used = library.find("demo")?.entry.lastUsedAt;
    await h.clock.advance(days(3));
    library.list();
    library.find("demo");
    library.requireFolder("demo");
    await library.checkAutoClean(none);
    expect(library.find("demo")?.entry.lastUsedAt).toBe(used);
  });

  it("[LIBRARY-AUTO-CLEAN-25] 正在运行的项目顺延一天，记成 snoozedUntil；停下后的下一轮可清理", async () => {
    const { h, library } = await autoCleanSetup(7);
    const id = library.find("demo")?.entry.id as string;
    await h.clock.advance(days(8));
    await library.ackReminder("demo");
    await h.clock.advance(days(1));
    const busy = await library.checkAutoClean(new Set([id]));
    expect(busy.clean).toEqual([]);
    expect(busy.postponed).toEqual([{ id, until: h.clock.now() + days(1) }]);
    expect(library.find("demo")?.entry.clean?.snoozedUntil).toBe(h.clock.now() + days(1));
    expect(library.find("demo")?.entry.clean?.remindedAt).toBeDefined();
    expect((await library.checkAutoClean(none)).clean).toEqual([]);
    await h.clock.advance(days(1));
    expect((await library.checkAutoClean(none)).clean).toEqual([id]);
  });

  it("[LIBRARY-AUTO-CLEAN-28] 找不到文件夹的项目两份清单里都没有", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(30));
    h.fs.remove(h.at("demo"));
    await library.rescan();
    const verdict = await library.checkAutoClean(none);
    expect([...verdict.remind, ...verdict.clean]).toEqual([]);
  });

  it("[LIBRARY-AUTO-CLEAN-29] 根目录不在：整轮跳过，没有项目被标成找不到；[LIBRARY-AUTO-CLEAN-30] 回来后正常判断", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(30));
    const files = [h.at("demo", "a.txt"), h.at("demo", ".runyard", "playground.json")];
    const saved = files.map((f) => h.fs.readFile(f));
    h.fs.remove(h.root);
    const skipped = await library.checkAutoClean(none);
    expect(skipped).toMatchObject({ remind: [], clean: [], skipped: "root-missing" });
    expect(library.find("demo")?.entry.missingSince).toBeUndefined();
    for (const [i, f] of files.entries()) h.fs.writeFile(f, saved[i] as string);
    const back = await library.checkAutoClean(none);
    expect(back.skipped).toBeUndefined();
    expect(back.remind).toHaveLength(1);
  });

  it("[LIBRARY-AUTO-CLEAN-24] 检查、记录使用、提醒都不会移动任何项目（清理只在应用里按清单执行）", async () => {
    const { h, library } = await autoCleanSetup(7);
    await h.clock.advance(days(30));
    await library.ackReminder("demo");
    await h.clock.advance(days(2));
    expect((await library.checkAutoClean(none)).clean).toHaveLength(1);
    await library.markUsed("demo");
    expect(h.fs.trashed).toEqual([]);
    expect(h.fs.exists(h.at("demo"))).toBe(true);
  });

  it("[LIBRARY-AUTO-CLEAN-36] 索引丢失重建后上次使用是当前时间：两份清单都是空的", async () => {
    const { h, library } = await autoCleanSetup(7);
    await library.keep("demo");
    await library.setAutoClean("demo", 7);
    await h.clock.advance(days(60));
    h.fs.remove(h.indexPath);
    const reopened = await h.open();
    const verdict = await reopened.checkAutoClean(none);
    expect([...verdict.remind, ...verdict.clean]).toEqual([]);
    expect(reopened.find("demo")?.entry.lastUsedAt).toBe(h.clock.now());
  });

  async function dueProject() {
    const s = await autoCleanSetup(7);
    await s.h.clock.advance(days(8));
    await s.library.ackReminder("demo");
    await s.h.clock.advance(days(1));
    return s;
  }

  it("[LIBRARY-AUTO-CLEAN-31] 清理一个可清理项目：进废纸篓（可恢复），资源库里不再有它", async () => {
    const { h, library } = await dueProject();
    const id = library.find("demo")?.entry.id as string;
    expect((await library.checkAutoClean(none)).clean).toEqual([id]);
    const outcome = await library.trash(id, idle);
    expect(outcome.restorable).toBe(true);
    expect(h.fs.trashed).toHaveLength(1);
    expect(library.find("demo")).toBeUndefined();
  });

  it("[LIBRARY-AUTO-CLEAN-32] 放不进废纸篓：TRASH_UNAVAILABLE，文件夹完整，下一轮仍可清理", async () => {
    const { h, library } = await dueProject();
    const id = library.find("demo")?.entry.id as string;
    h.fs.failTrash();
    expect(await codeOf(library.trash(id, idle))).toBe("TRASH_UNAVAILABLE");
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("demo");
    expect((await library.checkAutoClean(none)).clean).toEqual([id]);
  });

  it("[LIBRARY-AUTO-CLEAN-33] 文件夹被占用：PATH_LOCKED（平台层的码原样带出），文件夹仍在原处", async () => {
    const { h, library } = await dueProject();
    const id = library.find("demo")?.entry.id as string;
    // 平台层因占用拒绝（假平台的废纸篓不看占用，这里直接让它抛平台层的 PATH_LOCKED）
    const original = h.platform.fs.trash;
    h.platform.fs.trash = async () => {
      throw platformError("PATH_LOCKED", { name: "demo" }, "EBUSY");
    };
    expect(await codeOf(library.trash(id, idle))).toBe("PATH_LOCKED");
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("demo");
    expect(h.fs.trashed).toEqual([]);
    h.platform.fs.trash = original;
  });
});
