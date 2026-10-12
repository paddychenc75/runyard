import { posixRelPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { isLibraryError } from "./library-error.ts";
import { createLibraryHarness, seedOf, user } from "./library-harness.test.ts";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isLibraryError(error)) return error.error.code;
    throw error;
  }
  return "no error";
}

describe("创建项目", () => {
  it("[LIBRARY-PLAYGROUNDS-01] 复制模板文件、写 playground.json、登记索引，结果带路径、id、created 和 retention", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const result = await library.create(
      seedOf("react19", { "src/main.tsx": "export {}\n", "package.json": "{}\n" }),
      { name: "pricing-table", note: "pricing table layout test", createdBy: user },
    );
    expect(result.created).toBe(true);
    expect(result.path).toBe(h.at("pricing-table"));
    expect(result.retention).toBe("kept");
    expect(result.entry.id).toBe(result.file.id);
    expect(h.fs.readFile(h.at("pricing-table", "src", "main.tsx"))).toBe("export {}\n");
    const onDisk = h.readJson(h.at("pricing-table", ".runyard", "playground.json"));
    expect(onDisk).toMatchObject({
      formatVersion: 1,
      id: result.file.id,
      note: "pricing table layout test",
      autoClean: { enabled: false },
      template: { id: "react19" },
    });
    expect(onDisk).not.toHaveProperty("name");
    // 登记到索引：端口、lastUsedAt
    const index = h.readJson(h.indexPath) as { playgrounds: Record<string, unknown>[] };
    expect(index.playgrounds).toEqual([
      expect.objectContaining({ id: result.file.id, path: h.at("pricing-table"), port: 7100 }),
    ]);
    expect(library.list().map((item) => item.name)).toEqual(["pricing-table"]);
  });

  it("[LIBRARY-PLAYGROUNDS-01] 打开自动清理时 retention 是 auto-clean，天数写进元数据", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const result = await library.create(seedOf("react19"), {
      name: "tmp",
      autoCleanDays: 7,
      createdBy: user,
    });
    expect(result.retention).toBe("auto-clean");
    expect(result.file.autoClean).toEqual({ enabled: true, days: 7 });
  });

  it("[LIBRARY-PLAYGROUNDS-02] 记录创建者：智能体的名字、创建命令和备注", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const result = await library.create(seedOf("react19"), {
      name: "from-agent",
      note: "try it",
      createdBy: { kind: "agent", agent: "Claude Code", command: "runyard new react19" },
    });
    const onDisk = h.readJson(h.at("from-agent", ".runyard", "playground.json"));
    expect(onDisk.createdBy).toEqual({
      kind: "agent",
      agent: "Claude Code",
      command: "runyard new react19",
    });
    expect(onDisk.note).toBe("try it");
    expect(result.file.createdAt).toBe(h.clock.now());
  });

  it("[LIBRARY-PLAYGROUNDS-04] --if-exists reuse 返回已有项目，不新建、不覆盖文件", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const first = await library.create(seedOf("react19", { "a.txt": "original" }), {
      name: "demo",
      createdBy: user,
    });
    h.fs.writeFile(h.at("demo", "a.txt"), "edited by user");
    const again = await library.create(seedOf("react19", { "a.txt": "template" }), {
      name: "demo",
      ifExists: "reuse",
      createdBy: user,
    });
    expect(again.created).toBe(false);
    expect(again.file.id).toBe(first.file.id);
    expect(h.fs.readFile(h.at("demo", "a.txt"))).toBe("edited by user");
    expect(library.list()).toHaveLength(1);
  });

  it("[LIBRARY-PLAYGROUNDS-04] --if-exists fail（以及缺省）报 NAME_EXISTS", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    await library.create(seedOf("react19"), { name: "demo", createdBy: user });
    for (const ifExists of ["fail", undefined] as const) {
      expect(
        await codeOf(
          library.create(seedOf("react19"), { name: "demo", ifExists, createdBy: user }),
        ),
      ).toBe("NAME_EXISTS");
    }
  });

  it("[LIBRARY-PLAYGROUNDS-05] 路径接近上限时结果带 PATH_NEAR_LIMIT，创建照常进行", async () => {
    const h = createLibraryHarness();
    const library = await h.open({ length: "near-limit", pathLimit: 1024 });
    const result = await library.create(seedOf("react19"), { name: "demo", createdBy: user });
    expect(result.created).toBe(true);
    expect(result.notices).toEqual([
      { code: "PATH_NEAR_LIMIT", params: { length: [...h.at("demo")].length, limit: 1024 } },
    ]);
  });

  it("[LIBRARY-PLAYGROUNDS-05] 路径正常时没有提示；超过上限报 PATH_TOO_LONG 且什么都没建", async () => {
    const h = createLibraryHarness();
    const ok = await (await h.open()).create(seedOf("react19"), { name: "a", createdBy: user });
    expect(ok.notices).toEqual([]);
    const library = await h.open({ length: "too-long" });
    expect(await codeOf(library.create(seedOf("react19"), { name: "b", createdBy: user }))).toBe(
      "PATH_TOO_LONG",
    );
    expect(h.fs.exists(h.at("b"))).toBe(false);
  });

  it("没有端口的运行器（脚本）登记时不带 port", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const result = await library.create(seedOf("ts-script", undefined, "script"), {
      name: "s",
      createdBy: user,
    });
    expect(result.entry).not.toHaveProperty("port");
  });

  it("复制中途失败：半成品进废纸篓，不留下没有元数据的文件夹，索引不变", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const seed = seedOf("react19");
    const broken = {
      ...seed,
      files: (async function* () {
        yield { path: posixRelPath("a.txt"), contents: "x" };
        throw new Error("disk full");
      })(),
    };
    await expect(library.create(broken, { name: "half", createdBy: user })).rejects.toThrow(
      "disk full",
    );
    expect(h.fs.exists(h.at("half"))).toBe(false);
    expect(h.fs.trashed).toHaveLength(1);
    expect(library.list()).toHaveLength(0);
  });

  it("模板文件不许写进 .runyard 目录", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    const seed = seedOf("react19", { ".runyard/playground.json": "{}" });
    expect(await codeOf(library.create(seed, { name: "evil", createdBy: user }))).toBe("INTERNAL");
  });

  it("更新版本写的 library.json：创建被拒绝（DATA_FROM_NEWER_VERSION），不写任何东西", async () => {
    const h = createLibraryHarness();
    h.fs.writeFile(h.indexPath, JSON.stringify({ formatVersion: 9, root: "/x", playgrounds: [] }));
    const library = await h.open();
    expect(await codeOf(library.create(seedOf("react19"), { name: "demo", createdBy: user }))).toBe(
      "DATA_FROM_NEWER_VERSION",
    );
    expect(h.fs.exists(h.at("demo"))).toBe(false);
    expect(h.readJson(h.indexPath).formatVersion).toBe(9);
  });
});
