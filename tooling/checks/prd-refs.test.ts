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

  it("规格里每条要求都有“来源”一行时通过；缺了就报", () => {
    const spec = (source: string) =>
      `# 规格\n\n## Requirements\n\n### Requirement: 关闭即停止\n标签页持有的运行 MUST 停止。\n${source}\n\n#### Scenario: [RUN-OWNERSHIP-01] 关闭\n- **WHEN** 关闭\n- **THEN** 停止\n- 验证：test\n`;
    const good = makeRepo({
      "docs/product/02-prd.md": PRD,
      "openspec/specs/run/ownership/spec.md": spec("来源：PRD #prd-run"),
    });
    expect(prdRefs.run(good)).toEqual([]);
    const bad = makeRepo({
      "docs/product/02-prd.md": PRD,
      "openspec/specs/run/ownership/spec.md": spec(""),
    });
    expect(prdRefs.run(bad).join()).toContain(
      "openspec/specs/run/ownership/spec.md:5 要求“关闭即停止”没有“来源”一行",
    );
  });
});
