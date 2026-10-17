import { describe, expect, it } from "vitest";
import { createLibraryHarness, seedOf, user } from "./library-harness.test.ts";

describe("创建副本", () => {
  it("[DESKTOP-LIBRARY-VIEW-42] 内容照抄但不抄 node_modules，名称取模板标识加序号，备注和保留状态沿用，新 id 新端口", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    for (const n of [1, 2, 4]) {
      await library.create(seedOf("react19"), { name: `react19-${n}`, createdBy: user });
    }
    const origin = await library.create(
      seedOf("react19", { "src/main.tsx": "export {}\n", "package.json": "{}\n" }),
      { name: "react19-3", note: "图表库对比", autoCleanDays: 30, createdBy: user },
    );
    h.fs.writeFile(h.at("react19-3", "node_modules", "left-pad", "index.js"), "x");
    const copy = await library.duplicate("react19-3");
    expect(copy.name).toBe("react19-5");
    expect(copy.entry.id).not.toBe(origin.entry.id);
    expect(copy.entry.port).not.toBe(origin.entry.port);
    expect(copy.file).toMatchObject({ note: "图表库对比", autoClean: { enabled: true, days: 30 } });
    expect(h.fs.readFile(h.at("react19-5", "src", "main.tsx"))).toBe("export {}\n");
    expect(h.fs.exists(h.at("react19-5", "node_modules"))).toBe(false);
    // 原文件夹原样
    expect(h.fs.exists(h.at("react19-3", "node_modules", "left-pad", "index.js"))).toBe(true);
    const onDisk = h.readJson(h.at("react19-5", ".runyard", "playground.json"));
    expect(onDisk.id).toBe(copy.entry.id);
  });

  it("[DESKTOP-LIBRARY-VIEW-42] 给了已存在的名称报 NAME_EXISTS，什么都没复制", async () => {
    const h = createLibraryHarness();
    const library = await h.open();
    await library.create(seedOf("react19"), { name: "a", createdBy: user });
    await library.create(seedOf("react19"), { name: "b", createdBy: user });
    await expect(library.duplicate("a", { name: "b" })).rejects.toMatchObject({
      error: { code: "NAME_EXISTS" },
    });
    expect(library.list()).toHaveLength(2);
  });
});
