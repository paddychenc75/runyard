import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildIconTable, IconSourceError, parseIconSource, renderIconTable } from "./icons.ts";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = (inner: string, attributes = 'viewBox="0 0 16 16"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${inner}</svg>`;

describe("图标源文件的校验", () => {
  it("合规的图标得到名字、viewBox 和路径", () => {
    expect(parseIconSource("plus.svg", svg('<path d="M1 1"/><path d="M2 2"/>'))).toEqual({
      name: "plus",
      viewBox: "0 0 16 16",
      paths: ["M1 1", "M2 2"],
    });
  });

  it.each([
    ["viewBox 不是 16 或 24 的网格", svg('<path d="M1 1"/>', 'viewBox="0 0 20 20"')],
    ["内联样式", svg('<path d="M1 1" style="stroke:red"/>')],
    ["写死的颜色", svg('<path d="M1 1" stroke="#ff0000"/>')],
    ["根元素上写死的颜色", svg('<path d="M1 1"/>', 'viewBox="0 0 16 16" fill="red"')],
    ["圆元素", svg('<circle cx="8" cy="8" r="4"/>')],
    ["没有路径", svg("")],
  ])("%s 被拒绝", (_reason, text) => {
    expect(() => parseIconSource("x.svg", text)).toThrow(IconSourceError);
  });

  it("currentColor 和 none 可以用，文件名要小写连字符", () => {
    expect(() =>
      parseIconSource("a-b.svg", svg('<path d="M1 1" stroke="currentColor" fill="none"/>')),
    ).not.toThrow();
    expect(() => parseIconSource("Bad_Name.svg", svg('<path d="M1 1"/>'))).toThrow(IconSourceError);
  });
});

describe("图标表生成", () => {
  it("提交的图标表和现在从 svg 目录生成的一致", () => {
    const committed = readFileSync(join(packageDir, "src/icons/generated/icon-paths.ts"), "utf8");
    expect(committed).toBe(buildIconTable(packageDir));
  });

  it("路径多到一行放不下时每项一行（和 Biome 的排版一致）", () => {
    const long = "M".padEnd(60, "1");
    const text = renderIconTable([{ name: "x", viewBox: "0 0 16 16", paths: [long, long] }]);
    expect(text).toContain(`      "${long}",\n      "${long}",\n    ],`);
  });
});
