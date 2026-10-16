import { join } from "node:path";
import { absPath, type LengthVerdict } from "@runyard/platform";
import { afterEach, describe, expect, it } from "vitest";
import { cliOwner, LibraryWorld } from "./library-harness.test.ts";

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

async function setup() {
  lw = new LibraryWorld();
  await lw.start();
  return lw.client();
}

type Pg = { id: string; name: string; path: string; port?: number; missingSince?: number };

describe("创建与查询", () => {
  it("[LIBRARY-PLAYGROUNDS-01] 创建：文件夹、元数据、id 和默认已保留都齐全，并发出 playground.added", async () => {
    const app = await setup();
    const result = await lw.create(app, "pricing-table", { note: "pricing table layout test" });
    expect(result.created).toBe(true);
    expect(result.playground).toMatchObject({
      name: "pricing-table",
      path: lw.at("pricing-table"),
      note: "pricing table layout test",
      autoClean: { enabled: false },
    });
    expect(lw.fs.exists(lw.at("pricing-table", ".runyard", "playground.json"))).toBe(true);
    expect(lw.fs.exists(lw.at("pricing-table", "index.js"))).toBe(true);
    expect(await app.waitForEvent("playground.added")).toMatchObject({ name: "pricing-table" });
  });

  it("[LIBRARY-PLAYGROUNDS-04] 已存在时复用：created 为 false，不覆盖；fail 报 NAME_EXISTS", async () => {
    const app = await setup();
    const first = await lw.create(app, "demo");
    const again = await lw.create(app, "demo", { ifExists: "reuse" });
    expect(again).toMatchObject({ created: false, playground: { id: first.playground.id } });
    expect(
      await app.errorCode("playground.create", {
        template: "react19",
        name: "demo",
        ifExists: "fail",
        createdBy: { kind: "user" },
      }),
    ).toBe("NAME_EXISTS");
  });

  it("[LIBRARY-PLAYGROUNDS-05] 路径接近长度上限：结果带 PATH_NEAR_LIMIT 提示，创建仍然进行", async () => {
    lw = new LibraryWorld();
    const real = lw.world.fake.platform;
    const platform = {
      ...real,
      paths: { ...real.paths, checkLength: (): LengthVerdict => "near-limit" },
    };
    lw.handle = await lw.world.start({
      platform,
      log: (line) => lw.logs.push(line),
      extend: () => ({ library: lw.seams() }),
    });
    const app = await lw.client();
    const response = await app.result<{ notices: { code: string }[] }>("playground.create", {
      template: "react19",
      name: "deep",
      createdBy: { kind: "user" },
    });
    expect(response.notices.map((notice) => notice.code)).toEqual(["PATH_NEAR_LIMIT"]);
    expect(lw.fs.exists(lw.at("deep", ".runyard", "playground.json"))).toBe(true);
  });

  it("[LIBRARY-PLAYGROUNDS-06] 不给名称：取现存同模板项目最大序号加一", async () => {
    const app = await setup();
    await lw.create(app, "react19-1");
    await lw.create(app, "react19-3");
    const result = await app.result<{ playground: Pg }>("playground.create", {
      template: "react19",
      createdBy: { kind: "user" },
    });
    expect(result.playground.name).toBe("react19-4");
  });

  it("[LIBRARY-PLAYGROUNDS-08] 名称长度边界：64 个字符成功，65 个字符 NAME_INVALID", async () => {
    const app = await setup();
    expect((await lw.create(app, "a".repeat(64))).created).toBe(true);
    expect(
      await app.errorCode("playground.create", {
        template: "react19",
        name: "a".repeat(65),
        createdBy: { kind: "user" },
      }),
    ).toBe("NAME_INVALID");
  });

  it("list 按运行中和创建者过滤；get 找不到报 PLAYGROUND_NOT_FOUND", async () => {
    const app = await setup();
    const a = await lw.create(app, "alpha");
    await lw.create(app, "beta", { createdBy: { kind: "agent", agent: "Claude Code" } });
    lw.runs.active.set(a.playground.id, cliOwner);
    expect(
      (await app.result<Pg[]>("playground.list", { filter: { running: true } })).map((p) => p.name),
    ).toEqual(["alpha"]);
    expect(
      (await app.result<Pg[]>("playground.list", { filter: { createdBy: "agent" } })).map(
        (p) => p.name,
      ),
    ).toEqual(["beta"]);
    expect(await app.result<Pg>("playground.get", { playground: "beta" })).toMatchObject({
      name: "beta",
    });
    expect(await app.errorCode("playground.get", { playground: "nope" })).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
  });

  it("没有模板实现时创建报 TEMPLATE_NOT_FOUND，template.list 为空，template.get 报 TEMPLATE_NOT_FOUND", async () => {
    lw = new LibraryWorld();
    lw.handle = await lw.world.start({ extend: () => ({}) });
    const app = await lw.client();
    expect(
      await app.errorCode("playground.create", {
        template: "react19",
        createdBy: { kind: "user" },
      }),
    ).toBe("TEMPLATE_NOT_FOUND");
    expect(await app.result("template.list", {})).toEqual([]);
    expect(await app.errorCode("template.get", { id: "react19" })).toBe("TEMPLATE_NOT_FOUND");
  });
});

describe("更新、忘记与被动过的文件夹", () => {
  it("update 改备注和自动清理（null 关闭），发出 playground.changed", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    const updated = await app.result<{ note: string; autoClean: unknown }>("playground.update", {
      playground: "demo",
      note: "新备注",
      autoClean: 7,
    });
    expect(updated).toMatchObject({ note: "新备注", autoClean: { enabled: true, days: 7 } });
    const off = await app.result<{ autoClean: unknown }>("playground.update", {
      playground: "demo",
      autoClean: null,
    });
    expect(off.autoClean).toEqual({ enabled: false });
    expect(app.eventsOf("playground.changed").length).toBeGreaterThanOrEqual(2);
  });

  it("forget 只从资源库移除，磁盘不动，发出 playground.removed", async () => {
    const app = await setup();
    const { playground } = await lw.create(app, "demo");
    await app.result("playground.forget", { playground: "demo" });
    expect(await app.result("playground.list", {})).toEqual([]);
    expect(lw.fs.exists(lw.at("demo", ".runyard", "playground.json"))).toBe(true);
    expect(await app.waitForEvent("playground.removed")).toEqual({ playgroundId: playground.id });
  });

  it("[LIBRARY-PLAYGROUNDS-26] 在访达里改了名：library.rescan 按 id 认回，端口和设置不变，发出 playground.changed", async () => {
    const app = await setup();
    await lw.create(app, "demo", { autoClean: 7 });
    const before = await app.result<Pg>("playground.get", { playground: "demo" });
    // 外部改名：直接在内存文件系统里搬
    await lw.world.fake.platform.fs.moveDir(lw.at("demo"), lw.at("demo-new"));
    await app.result("library.rescan", {});
    const after = await app.result<Pg & { autoClean: unknown }>("playground.get", {
      playground: before.id,
    });
    expect(after).toMatchObject({
      name: "demo-new",
      port: before.port,
      autoClean: { enabled: true, days: 7 },
    });
    expect(await app.waitForEvent("playground.changed")).toMatchObject({
      id: before.id,
      name: "demo-new",
    });
  });

  it("[LIBRARY-PLAYGROUNDS-27] 文件夹被移走：标记 missingSince，发出 playground.missing，对它重命名报 FOLDER_MISSING", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    lw.fs.remove(lw.at("demo"));
    await app.result("library.rescan", {});
    expect(await app.waitForEvent("playground.missing")).toMatchObject({
      name: "demo",
      template: { id: "react19" },
    });
    expect(
      (await app.result<Pg>("playground.get", { playground: "demo" })).missingSince,
    ).toBeDefined();
    expect(await app.errorCode("playground.rename", { playground: "demo", newName: "other" })).toBe(
      "FOLDER_MISSING",
    );
  });

  it("[LIBRARY-PLAYGROUNDS-28] 重新定位：id 对得上就恢复，missingSince 清除，端口不变", async () => {
    const app = await setup();
    const { playground } = await lw.create(app, "demo");
    const elsewhere = absPath(join(lw.root, "..", "elsewhere", "moved"));
    await lw.world.fake.platform.fs.moveDir(lw.at("demo"), elsewhere);
    await app.result("library.rescan", {});
    const restored = await app.result<Pg>("playground.relocate", {
      playground: playground.id,
      path: elsewhere,
    });
    expect(restored.missingSince).toBeUndefined();
    expect(restored.port).toBe(playground.port);
  });

  it("[LIBRARY-PLAYGROUNDS-29] 复制出同 id 的第二份：扫描后多出来的那份换新 id，发出 playground.added", async () => {
    const app = await setup();
    const { playground } = await lw.create(app, "demo");
    lw.fs.writeFile(
      lw.at("demo-copy", ".runyard", "playground.json"),
      lw.fs.readFile(lw.at("demo", ".runyard", "playground.json")),
    );
    await app.result("library.rescan", {});
    const all = await app.result<Pg[]>("playground.list", {});
    expect(all).toHaveLength(2);
    expect(new Set(all.map((p) => p.id)).size).toBe(2);
    expect(all.find((p) => p.name === "demo")?.id).toBe(playground.id);
  });

  it("[LIBRARY-PLAYGROUNDS-30] 启动时索引不存在：扫描资源库重新登记每个带元数据的文件夹", async () => {
    lw = new LibraryWorld();
    const seeded = await lw.catalog.seed({ template: "react19", name: "demo" });
    lw.fs.writeFile(lw.at("demo", "index.js"), "x");
    lw.fs.writeFile(
      lw.at("demo", ".runyard", "playground.json"),
      JSON.stringify({
        formatVersion: 1,
        id: "OLD-ID",
        template: seeded.template,
        runner: "node-server",
        requires: {},
        toolchainAtCreate: {},
        createdAt: 1,
        createdBy: { kind: "user" },
        autoClean: { enabled: false },
        trust: "trusted",
      }),
    );
    await lw.start();
    const app = await lw.client();
    for (let i = 0; i < 50 && lw.world.discovery.log.length === 0; i++)
      await new Promise((r) => setImmediate(r));
    const all = await app.result<Pg[]>("playground.list", {});
    expect(all.map((p) => p.id)).toEqual(["OLD-ID"]);
  });
});
