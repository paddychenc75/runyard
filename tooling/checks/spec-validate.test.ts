import { describe, expect, it } from "vitest";
import { specValidate, validateOutput } from "./spec-validate.ts";
import { makeRepo } from "./test-helpers.ts";

const CONFIG = "schema: runyard\n";
const SPEC = (body: string) =>
  `# ownership Specification\n\n## Purpose\n\n每一次运行有一个持有者，本规格约定关闭标签页、退出应用、应用崩溃时各自会发生什么，以及命令行持有的运行怎样在空闲后自动停止，避免智能体启动的服务一直挂着。\n\n## Requirements\n\n### Requirement: 关闭即停止\n标签页持有的运行 MUST 停止。\n来源：实现细节\n\n${body}`;
const SCENARIO =
  "#### Scenario: [RUN-OWNERSHIP-01] 关闭\n- **WHEN** 关闭\n- **THEN** 停止\n- 验证：test\n";

describe("spec-validate 检查", () => {
  it("好样例：格式正确的规格通过严格校验", () => {
    const root = makeRepo({
      "openspec/config.yaml": CONFIG,
      "openspec/specs/run/ownership/spec.md": SPEC(SCENARIO),
    });
    expect(specValidate.run(root)).toEqual([]);
  });

  it("坏样例：要求没有场景，报出一句指令式的错误", () => {
    const root = makeRepo({
      "openspec/config.yaml": CONFIG,
      "openspec/specs/run/ownership/spec.md": SPEC(""),
    });
    const errors = specValidate.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("OpenSpec 严格校验没有通过");
    expect(errors[0]).toContain("pnpm spec validate --all --strict --no-interactive");
  });

  it("没有 openspec 目录的仓库直接通过", () => {
    expect(specValidate.run(makeRepo({ "README.md": "x\n" }))).toEqual([]);
  });

  it("退出码为 0 通过；非 0 时摘出失败行，没有失败行就带上输出开头", () => {
    expect(validateOutput(0, "")).toEqual([]);
    expect(validateOutput(1, "  ✗ spec/run/x\n    [ERROR] 缺少 MUST")[0]).toContain(
      "[ERROR] 缺少 MUST",
    );
    expect(validateOutput(1, "意外的输出")[0]).toContain("意外的输出");
  });
});
