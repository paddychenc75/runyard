import { describe, expect, it } from "vitest";
import { formatJson } from "./format-json.ts";

describe("format-json：与 Biome 的 JSON 格式化一致的排版", () => {
  it("对象逐行展开，缩进两格，末尾一个换行", () => {
    expect(formatJson({ a: 1, b: { c: "x" } })).toBe(
      '{\n  "a": 1,\n  "b": {\n    "c": "x"\n  }\n}\n',
    );
  });

  it("简单值的数组放得下就写在一行，放不下一项一行", () => {
    expect(formatJson({ a: ["x", "y"] })).toBe('{\n  "a": ["x", "y"]\n}\n');
    const long = Array.from({ length: 12 }, (_, i) => `item-number-${i}`);
    const text = formatJson({ a: long });
    expect(text.split("\n").length).toBeGreaterThan(12);
    expect(text).toContain('    "item-number-0",\n');
  });

  it("含对象的数组、空对象、空数组", () => {
    expect(formatJson({ a: [{ b: 1 }], c: {}, d: [] })).toBe(
      '{\n  "a": [\n    {\n      "b": 1\n    }\n  ],\n  "c": {},\n  "d": []\n}\n',
    );
  });
});
