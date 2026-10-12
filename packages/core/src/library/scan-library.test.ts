import type { AbsPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { isLibraryError } from "./library-error.ts";
import { createLibraryHarness, type LibraryHarness, seedOf, user } from "./library-harness.test.ts";

// 在 harness 里“用户在 Finder 里做的事”：直接改内存文件系统，不经资源库
function moveFolder(h: LibraryHarness, from: string, to: string) {
  for (const file of [...walk(h, h.at(from))]) {
    const target = file.replace(h.at(from), h.at(to)) as AbsPath;
    h.fs.writeFile(target, h.fs.readFile(file));
  }
  h.fs.remove(h.at(from));
}

function copyFolder(h: LibraryHarness, from: string, to: string) {
  for (const file of [...walk(h, h.at(from))]) {
    h.fs.writeFile(file.replace(h.at(from), h.at(to)) as AbsPath, h.fs.readFile(file));
  }
}

function* walk(h: LibraryHarness, dir: AbsPath): Generator<AbsPath> {
  for (const name of h.fs.list(dir)) {
    const child = `${dir}${dir.endsWith("/") || dir.endsWith("\\") ? "" : "/"}${name}` as AbsPath;
    try {
      h.fs.readFile(child);
      yield child;
    } catch {
      yield* walk(h, child);
    }
  }
}

async function setup(names: string[] = ["demo"]) {
  const h = createLibraryHarness();
  const library = await h.open();
  const created = [];
  for (const name of names) {
    created.push(
      await library.create(seedOf("react19", { "a.txt": name }), { name, createdBy: user }),
    );
  }
  return { h, library, created };
}

describe("文件夹在应用外被动过", () => {
  it("[LIBRARY-PLAYGROUNDS-26] 在 Finder 里改了名：按 id 认回，端口和设置不变，报告 changed", async () => {
    const { h, library, created } = await setup();
    const before = created[0]?.entry;
    const noteFile = h.readJson(h.at("demo", ".runyard", "playground.json"));
    moveFolder(h, "demo", "demo-new");
    const report = await library.rescan();
    expect(report.changes).toEqual([
      {
        kind: "changed",
        id: before?.id,
        name: "demo-new",
        path: h.at("demo-new"),
        reason: "renamed-or-moved",
      },
    ]);
    const item = library.find("demo-new");
    expect(item?.entry).toMatchObject({
      id: before?.id,
      port: before?.port,
      path: h.at("demo-new"),
    });
    expect(library.find("demo")).toBeUndefined();
    // 文件夹里的设置原样，索引落了盘
    expect(h.readJson(h.at("demo-new", ".runyard", "playground.json"))).toEqual(noteFile);
    const index = h.readJson(h.indexPath) as { playgrounds: { path: string }[] };
    expect(index.playgrounds.map((entry) => entry.path)).toEqual([h.at("demo-new")]);
  });

  it("[LIBRARY-PLAYGROUNDS-27] 文件夹被移走且找不到同一个 id：标 missingSince，操作它报 FOLDER_MISSING", async () => {
    const { h, library, created } = await setup();
    h.clock.advance(5000);
    const outside = h.fake.platform.paths.home;
    h.fs.writeFile(`${outside}/elsewhere/keep.txt` as AbsPath, "x");
    h.fs.remove(h.at("demo"));
    const report = await library.rescan();
    expect(report.changes).toEqual([
      { kind: "missing", id: created[0]?.entry.id, name: "demo", path: h.at("demo") },
    ]);
    expect(library.find("demo")?.entry.missingSince).toBe(h.clock.now());
    expect(() => library.requireFolder("demo")).toThrowError(/FOLDER_MISSING/);
    try {
      library.requireFolder("demo");
    } catch (error) {
      expect(isLibraryError(error) && error.error).toMatchObject({
        code: "FOLDER_MISSING",
        params: { name: "demo" },
      });
    }
    // 端口和设置还在，再扫一次不重复报告，missingSince 不变（保留起始时间）
    const firstSeen = library.find("demo")?.entry.missingSince;
    h.clock.advance(1000);
    expect((await library.rescan()).changes).toEqual([]);
    expect(library.find("demo")?.entry).toMatchObject({ port: 7100, missingSince: firstSeen });
  });

  it("[LIBRARY-PLAYGROUNDS-28] 重新定位：指到根目录之外、id 对得上的文件夹，恢复并清除 missingSince", async () => {
    const { h, library, created } = await setup();
    const elsewhere = `${h.fake.platform.paths.home}/Desktop/moved-demo` as AbsPath;
    moveFolder(h, "demo", "tmp-away");
    for (const file of [...walk(h, h.at("tmp-away"))]) {
      h.fs.writeFile(file.replace(h.at("tmp-away"), elsewhere) as AbsPath, h.fs.readFile(file));
    }
    h.fs.remove(h.at("tmp-away"));
    await library.rescan();
    expect(library.find("demo")?.entry.missingSince).toBeDefined();

    const entry = await library.relocate("demo", elsewhere);
    expect(entry).toMatchObject({ id: created[0]?.entry.id, port: 7100, path: elsewhere });
    expect(entry).not.toHaveProperty("missingSince");
    // 根目录之外的项目，之后的扫描不会把它重新标成找不到
    expect((await library.rescan()).changes).toEqual([]);
    expect(library.find(created[0]?.entry.id ?? "")?.entry.missingSince).toBeUndefined();
  });

  it("[LIBRARY-PLAYGROUNDS-28] 重新定位到 id 对不上的文件夹被拒绝，状态不变", async () => {
    const { h, library } = await setup(["demo", "other"]);
    h.fs.remove(h.at("demo"));
    await library.rescan();
    await expect(library.relocate("demo", h.at("other"))).rejects.toMatchObject({
      error: { code: "PLAYGROUND_NOT_FOUND" },
    });
    expect(library.find("demo")?.entry.missingSince).toBeDefined();
  });

  it("[LIBRARY-PLAYGROUNDS-29] 在文件管理器里复制了项目：路径与索引一致的保留 id，另一份换新 id 和新端口", async () => {
    const { h, library, created } = await setup();
    const original = created[0]?.entry;
    copyFolder(h, "demo", "demo-copy");
    const report = await library.rescan();
    const copied = report.changes.find((change) => change.kind === "copied");
    expect(copied).toMatchObject({ kind: "copied", oldId: original?.id, name: "demo-copy" });

    const kept = library.find("demo");
    const copy = library.find("demo-copy");
    expect(kept?.entry).toMatchObject({ id: original?.id, port: 7100 });
    expect(copy?.entry.id).not.toBe(original?.id);
    expect(copy?.entry.port).toBe(7101);
    // 新 id 也写回了复制品自己的 playground.json，原件不变
    expect(h.readJson(h.at("demo-copy", ".runyard", "playground.json")).id).toBe(copy?.entry.id);
    expect(h.readJson(h.at("demo", ".runyard", "playground.json")).id).toBe(original?.id);
    // 再扫一次已经稳定
    expect((await library.rescan()).changes).toEqual([]);
  });

  it("[LIBRARY-PLAYGROUNDS-29] 复制品排在原件前面（按名字排序）也保留路径一致的那份", async () => {
    const { h, library, created } = await setup(["zeta"]);
    copyFolder(h, "zeta", "alpha");
    await library.rescan();
    expect(library.find("zeta")?.entry.id).toBe(created[0]?.entry.id);
    expect(library.find("alpha")?.entry.id).not.toBe(created[0]?.entry.id);
  });

  it("[LIBRARY-PLAYGROUNDS-29] 复制品的 playground.json 里不认识的字段在换 id 时不丢", async () => {
    const { h, library } = await setup();
    const path = h.at("demo", ".runyard", "playground.json");
    h.fs.writeFile(path, JSON.stringify({ ...h.readJson(path), futureField: { a: 1 } }));
    copyFolder(h, "demo", "demo-copy");
    await library.rescan();
    expect(h.readJson(h.at("demo-copy", ".runyard", "playground.json")).futureField).toEqual({
      a: 1,
    });
  });

  it("[LIBRARY-PLAYGROUNDS-30] library.json 被删除后重建：带元数据的文件夹都重新登记、重新分配端口、lastUsedAt 取当前时间", async () => {
    const { h, library } = await setup(["one", "two"]);
    h.fs.remove(h.indexPath);
    h.clock.advance(60_000);
    const rebuilt = await h.open();
    expect(rebuilt.list().map((item) => item.name)).toEqual(["one", "two"]);
    expect(rebuilt.list().map((item) => item.entry.port)).toEqual([7100, 7101]);
    for (const item of rebuilt.list()) expect(item.entry.lastUsedAt).toBe(h.clock.now());
    expect(library.list()).toHaveLength(2);
    const index = h.readJson(h.indexPath) as { playgrounds: unknown[] };
    expect(index.playgrounds).toHaveLength(2);
  });

  it("[LIBRARY-PLAYGROUNDS-30] library.json 坏了：改名留存坏文件，再从磁盘重建", async () => {
    const { h } = await setup(["one"]);
    h.fs.writeFile(h.indexPath, "{ not json");
    const rebuilt = await h.open();
    expect(rebuilt.list().map((item) => item.name)).toEqual(["one"]);
    const kept = h.fs
      .list((h.fake.platform.paths.stateDir + "/state") as AbsPath)
      .filter((n) => n.includes(".corrupt-"));
    expect(kept).toHaveLength(1);
    expect(h.fs.readFile(`${h.fake.platform.paths.stateDir}/state/${kept[0]}` as AbsPath)).toBe(
      "{ not json",
    );
  });

  it("判断表第 4 行：没有 .runyard/playground.json 的文件夹和普通文件被忽略", async () => {
    const { h, library } = await setup();
    h.fs.writeFile(h.at("notes", "todo.txt"), "x");
    h.fs.writeFile(h.at("loose.txt"), "x");
    h.fs.writeFile(h.at("half", ".runyard", "other.json"), "{}");
    const report = await library.rescan();
    expect(report).toEqual({ changes: [], skipped: [] });
    expect(library.list().map((item) => item.name)).toEqual(["demo"]);
  });

  it("判断表第 5 行：磁盘上有、索引里没有的项目被登记并分配端口（不是重建时也一样）", async () => {
    const { h, library } = await setup(["demo"]);
    const other = createLibraryHarness({ idPrefix: "OTHER" });
    const made = await (await other.open()).create(seedOf("vue3"), {
      name: "dropped",
      createdBy: user,
    });
    // 把另一处创建的项目文件夹放进这个资源库
    for (const file of [...walk(other, other.at("dropped"))]) {
      h.fs.writeFile(
        file.replace(other.at("dropped"), h.at("dropped")) as AbsPath,
        other.fs.readFile(file),
      );
    }
    const report = await library.rescan();
    expect(report.changes).toEqual([
      { kind: "added", id: made.entry.id, name: "dropped", path: h.at("dropped") },
    ]);
    expect(library.find("dropped")?.entry.port).toBe(7101);
  });

  it("playground.json 坏了的文件夹被跳过并报告，不重写；它原来的登记不会被误判为别的项目", async () => {
    const { h, library } = await setup();
    h.fs.writeFile(h.at("demo", ".runyard", "playground.json"), "garbage");
    const report = await library.rescan();
    expect(report.skipped).toEqual([{ path: h.at("demo"), reason: "corrupt" }]);
    expect(h.fs.readFile(h.at("demo", ".runyard", "playground.json"))).toBe("garbage");
  });

  it("更新版本写的 playground.json：按 id 认回但不改写，复制品也不改写", async () => {
    const { h, library, created } = await setup();
    const path = h.at("demo", ".runyard", "playground.json");
    const newer = JSON.stringify({ ...h.readJson(path), formatVersion: 9 });
    h.fs.writeFile(path, newer);
    moveFolder(h, "demo", "demo2");
    copyFolder(h, "demo2", "demo3");
    const report = await library.rescan();
    expect(library.find("demo2")?.entry.id).toBe(created[0]?.entry.id);
    expect(report.skipped).toContainEqual({ path: h.at("demo3"), reason: "newer" });
    expect(h.fs.readFile(h.at("demo3", ".runyard", "playground.json"))).toBe(newer);
  });

  it("更新版本写的 library.json：能列出，扫描和写入一律拒绝 DATA_FROM_NEWER_VERSION，文件原样", async () => {
    const { h } = await setup();
    const index = h.readJson(h.indexPath);
    const newer = JSON.stringify({ ...index, formatVersion: 9 });
    h.fs.writeFile(h.indexPath, newer);
    const library = await h.open();
    expect(library.list().map((item) => item.name)).toEqual(["demo"]);
    h.fs.remove(h.at("demo"));
    await expect(library.rescan()).rejects.toMatchObject({
      error: {
        code: "DATA_FROM_NEWER_VERSION",
        params: { file: "library.json", found: 9, supported: 1 },
      },
    });
    expect(h.fs.readFile(h.indexPath)).toBe(newer);
  });

  it("索引里不认识的字段（顶层和每一项）在重写后保留", async () => {
    const { h, library } = await setup();
    const index = h.readJson(h.indexPath) as { playgrounds: Record<string, unknown>[] };
    h.fs.writeFile(
      h.indexPath,
      JSON.stringify({
        ...index,
        futureTop: true,
        playgrounds: index.playgrounds.map((entry) => ({ ...entry, futureEntry: "x" })),
      }),
    );
    const reopened = await h.open();
    moveFolder(h, "demo", "renamed");
    await reopened.rescan();
    const written = h.readJson(h.indexPath) as {
      futureTop: boolean;
      playgrounds: Record<string, unknown>[];
    };
    expect(written.futureTop).toBe(true);
    expect(written.playgrounds[0]?.futureEntry).toBe("x");
    expect(library.list()).toHaveLength(1);
  });
});
