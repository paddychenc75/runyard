import { describe, expect, it } from "vitest";
import { checkSkips, skips } from "./skips.ts";
import { makeRepo } from "./test-helpers.ts";

// 把关键字拆开拼，免得这个文件自己被真实的 skips 检查拦住
const SKIP = ["it", "skip"].join(".");
const TODO = ["test", "todo"].join(".");
const XIT = ["x", "it"].join("");

describe("skips 检查", () => {
  it("没有跳过、或跳过带 issue 编号时通过", () => {
    expect(checkSkips("a.test.ts", `it("做某事", () => {});\n`)).toEqual([]);
    expect(checkSkips("a.test.ts", `${SKIP}("做某事 #12", () => {});\n`)).toEqual([]);
    expect(
      checkSkips("a.test.ts", `// 等上游修复，见 #34\n${SKIP}("做某事", () => {});\n`),
    ).toEqual([]);
  });

  it("跳过的测试没有 issue 编号", () => {
    for (const call of [SKIP, TODO, XIT]) {
      expect(checkSkips("a.test.ts", `\n${call}("做某事", () => {});\n`).join()).toContain(
        "a.test.ts:2 跳过了测试",
      );
    }
  });

  it("只查测试文件", () => {
    const root = makeRepo({
      "packages/core/src/a.test.ts": `${SKIP}("x", () => {});\n`,
      "packages/core/src/a.ts": `// ${SKIP} 出现在普通源码里不算\n`,
    });
    expect(skips.run(root).length).toBe(1);
  });
});
