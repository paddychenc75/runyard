import { describe, expect, it } from "vitest";
import { makeRepo } from "./test-helpers.ts";
import { EXPECTED_SCRIPTS, testPhases } from "./test-phases.ts";

const GOOD = { name: "@runyard/x", scripts: { ...EXPECTED_SCRIPTS } };

describe("test-phases 检查", () => {
  it("两个阶段的脚本都对，或者包没有测试时通过", () => {
    const root = makeRepo({
      "packages/a/package.json": GOOD,
      "packages/b/package.json": { name: "@runyard/b" },
    });
    expect(testPhases.run(root)).toEqual([]);
  });

  it("缺进程阶段的脚本时报错并指出写法", () => {
    const root = makeRepo({
      "packages/a/package.json": { name: "@runyard/a", scripts: { test: EXPECTED_SCRIPTS.test } },
    });
    const errors = testPhases.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/a/package.json");
    expect(errors[0]).toContain("test:process");
  });

  it("单元阶段还是旧写法 vitest run 时报错（否则进程测试会混进单元阶段）", () => {
    const root = makeRepo({
      "packages/a/package.json": {
        name: "@runyard/a",
        scripts: { ...GOOD.scripts, test: "vitest run" },
      },
    });
    expect(testPhases.run(root).join()).toContain('脚本 test 应该是 "vitest run --project unit"');
  });
});
