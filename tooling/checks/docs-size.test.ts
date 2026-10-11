import { describe, expect, it } from "vitest";
import { docsSize, lineLimit } from "./docs-size.ts";
import { makeRepo } from "./test-helpers.ts";

const lines = (count: number) =>
  `${Array.from({ length: count }, (_, i) => `行 ${i}`).join("\n")}\n`;

describe("docs-size 检查", () => {
  it("各类说明文件的上限", () => {
    expect(lineLimit("AGENTS.md")).toBe(150);
    expect(lineLimit("packages/core/AGENTS.md")).toBe(80);
    expect(lineLimit("docs/product/README.md")).toBe(40);
    expect(lineLimit("docs/guides/add-a-dependency.md")).toBe(200);
    expect(lineLimit("docs/architecture/decisions/0001-x.md")).toBe(60);
    expect(lineLimit("docs/product/02-prd.md")).toBeUndefined();
  });

  it("不超过上限时通过", () => {
    expect(docsSize.run(makeRepo({ "AGENTS.md": lines(150) }))).toEqual([]);
  });

  it("根 AGENTS.md 超过 150 行", () => {
    expect(docsSize.run(makeRepo({ "AGENTS.md": lines(151) })).join()).toContain(
      "AGENTS.md 有 151 行，上限是 150 行",
    );
  });

  it("手册超过 200 行", () => {
    expect(docsSize.run(makeRepo({ "docs/guides/x.md": lines(201) })).join()).toContain(
      "上限是 200",
    );
  });
});
