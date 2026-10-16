import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtures } from "../workbench/registry.ts";
import { combinations, listComponents, snapshotName } from "./matrix.ts";

describe("截图矩阵", () => {
  it("五种组合：浅色中文、浅色英文、深色中文、深色英文、浅色伪语言", () => {
    expect(combinations.map((c) => snapshotName("X", c))).toEqual([
      "X-light-zh-CN.png",
      "X-light-en.png",
      "X-dark-zh-CN.png",
      "X-dark-en.png",
      "X-light-en-XA.png",
    ]);
  });

  it("要截图的组件和工作台登记的组件一致，新组件自动进矩阵", () => {
    const srcDir = join(import.meta.dirname, "../src");
    expect(listComponents(srcDir)).toEqual(fixtures.map((f) => f.meta.name).sort());
  });
});
