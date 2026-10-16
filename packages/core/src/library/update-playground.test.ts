import { describe, expect, it } from "vitest";
import { isLibraryError } from "./library-error.ts";
import { createLibraryHarness, seedOf, user } from "./library-harness.test.ts";

async function setup() {
  const h = createLibraryHarness();
  const library = await h.open();
  await library.create(seedOf("react19"), { name: "demo", createdBy: user });
  return { h, library };
}

describe("update 与 forget", () => {
  it("update 只改备注和脚本自动运行，其余字段（含未知字段）原样保留", async () => {
    const { h, library } = await setup();
    const file = h.at("demo", ".runyard", "playground.json");
    h.fs.writeFile(file, JSON.stringify({ ...h.readJson(file), future: { a: 1 } }));
    await library.update("demo", { note: "新备注", scriptAutoRun: false });
    const written = h.readJson(file);
    expect(written.note).toBe("新备注");
    expect(written.script).toEqual({ autoRun: false });
    expect(written.future).toEqual({ a: 1 });
    expect(written.id).toBe(library.find("demo")?.entry.id);
  });

  it("update 遇到更新版本写的 playground.json：DATA_FROM_NEWER_VERSION，文件不动", async () => {
    const { h, library } = await setup();
    const file = h.at("demo", ".runyard", "playground.json");
    const newer = JSON.stringify({ ...h.readJson(file), formatVersion: 9 });
    h.fs.writeFile(file, newer);
    const error = await library.update("demo", { note: "x" }).catch((e: unknown) => e);
    expect(isLibraryError(error) && error.error.code).toBe("DATA_FROM_NEWER_VERSION");
    expect(h.fs.readFile(file)).toBe(newer);
  });

  it("forget 只从索引移除，磁盘上的文件夹原样保留", async () => {
    const { h, library } = await setup();
    await library.forget("demo");
    expect(library.find("demo")).toBeUndefined();
    expect(h.fs.exists(h.at("demo", ".runyard", "playground.json"))).toBe(true);
    const saved = h.readJson(h.indexPath).playgrounds as unknown[];
    expect(saved).toHaveLength(0);
  });

  it("forget 找不到项目：PLAYGROUND_NOT_FOUND", async () => {
    const { library } = await setup();
    const error = await library.forget("nope").catch((e: unknown) => e);
    expect(isLibraryError(error) && error.error.code).toBe("PLAYGROUND_NOT_FOUND");
  });
});
