import { describe, expect, it } from "vitest";
import { prdAnchors, prdRefs } from "./prd-refs.ts";
import { makeRepo } from "./test-helpers.ts";

const PRD = '# 产品需求\n\n举例：`<a id="prd-example"></a>`\n\n<a id="prd-run"></a>\n## 运行\n';

describe("prd-refs 检查", () => {
  it("只认单独占一行的锚点", () => {
    expect(prdAnchors(PRD)).toEqual(["prd-run"]);
  });

  it("引用存在的锚点时通过", () => {
    const root = makeRepo({
      "docs/product/02-prd.md": PRD,
      "AGENTS.md": "见 PRD #prd-run 和 [运行](docs/product/02-prd.md#prd-run)。\n",
    });
    expect(prdRefs.run(root)).toEqual([]);
  });

  it("引用不存在的锚点", () => {
    const root = makeRepo({
      "docs/product/02-prd.md": PRD,
      "docs/guides/x.md": "第一行\n见 PRD #prd-run-ownership。\n",
    });
    expect(prdRefs.run(root).join()).toContain(
      "docs/guides/x.md:2 引用了 PRD 锚点 #prd-run-ownership",
    );
  });

  it("PRD 不在", () => {
    expect(prdRefs.run(makeRepo({ "AGENTS.md": "x\n" })).join()).toContain("找不到");
  });
});
