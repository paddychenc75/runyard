import { describe, expect, it } from "vitest";
import { isFeatTitle, specTouchErrors } from "./spec-touch.ts";

const CODE = ["packages/core/src/run.ts"];

describe("spec-touch", () => {
  it("识别 feat 标题", () => {
    expect(isFeatTitle("feat(core): 增加运行状态机")).toBe(true);
    expect(isFeatTitle("feat!: 破坏性改动")).toBe(true);
    expect(isFeatTitle("fix(core): 修复")).toBe(false);
    expect(isFeatTitle("docs: feat 相关")).toBe(false);
  });

  it("好样例：feat 同时改了规格；带 no-spec 标签；不是 feat；没碰产品代码", () => {
    expect(
      specTouchErrors("feat(core): x", [], [...CODE, "openspec/specs/run/lifecycle/spec.md"]),
    ).toEqual([]);
    expect(specTouchErrors("feat(core): x", ["no-spec"], CODE)).toEqual([]);
    expect(specTouchErrors("fix(core): x", [], CODE)).toEqual([]);
    expect(specTouchErrors("feat(tooling): x", [], ["tooling/checks/a.ts", "docs/a.md"])).toEqual(
      [],
    );
  });

  it("坏样例：feat 改了产品代码，没动规格也没有标签", () => {
    for (const file of ["packages/core/src/run.ts", "apps/desktop/src/main.ts"]) {
      const errors = specTouchErrors("feat(core): x", ["bug"], [file]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("no-spec");
    }
  });
});
