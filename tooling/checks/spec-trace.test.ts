import { describe, expect, it } from "vitest";
import { parseSpec } from "./spec-scenarios.ts";
import { checkSpecTrace, parsePending, referencedIds, specTrace } from "./spec-trace.ts";
import { makeRepo } from "./test-helpers.ts";

// 测试里的假测试文件内容用函数拼出来：源码里不能出现字面的“it("[编号]…”，
// 否则真实仓库的 spec-trace 会把这些样例当成真的引用
const tag = (id: string) => `[${id}]`;
const testFile = (...ids: string[]) =>
  `${ids.map((id) => `it("${tag(id)} 某个行为", () => {});`).join("\n")}\n`;

const scenario = (id: string, verify = "- 验证：test") =>
  `#### Scenario: ${tag(id)} 场景\n- **WHEN** 条件\n- **THEN** 结果\n${verify}\n`;
const spec = (body: string, path = "run/ownership") =>
  parseSpec(
    `openspec/specs/${path}/spec.md`,
    `# 规格\n\n## Requirements\n\n### Requirement: 要求\n正文 MUST 成立。\n来源：实现细节\n\n${body}`,
  );

const GOOD_SPEC = spec(
  `${scenario("RUN-OWNERSHIP-01")}\n${scenario("RUN-OWNERSHIP-02", "- 验证：manual（属于桌面应用）")}`,
);

describe("spec-trace 检查", () => {
  it("好样例：test 场景有测试、manual 写了原因、没有多余的引用", () => {
    expect(
      checkSpecTrace([GOOD_SPEC], { "packages/core/a.test.ts": testFile("RUN-OWNERSHIP-01") }, ""),
    ).toEqual([]);
  });

  it("test 场景没有测试也没登记：报错并指出怎么办", () => {
    const errors = checkSpecTrace([GOOD_SPEC], {}, "");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("RUN-OWNERSHIP-01 标了“验证：test”，但没有测试的标题引用它");
    expect(errors[0]).toContain("spec-pending.txt");
  });

  it("登记在待实现清单里的场景不报；有了测试还留在清单里就报，逼着删掉", () => {
    expect(checkSpecTrace([GOOD_SPEC], {}, "RUN-OWNERSHIP-01 # 等 #36\n")).toEqual([]);
    const errors = checkSpecTrace(
      [GOOD_SPEC],
      { "packages/core/a.test.ts": testFile("RUN-OWNERSHIP-01") },
      "RUN-OWNERSHIP-01\n",
    );
    expect(errors.join()).toContain("已经有测试");
  });

  it("清单里的编号在规格里不存在，或对应的是 manual 场景", () => {
    const errors = checkSpecTrace(
      [GOOD_SPEC],
      { "packages/core/a.test.ts": testFile("RUN-OWNERSHIP-01") },
      "RUN-OWNERSHIP-09\nRUN-OWNERSHIP-02\n",
    );
    expect(errors.join("\n")).toContain("编号 RUN-OWNERSHIP-09 在规格里不存在");
    expect(errors.join("\n")).toContain("场景 RUN-OWNERSHIP-02 不是“验证：test”");
  });

  it("测试标题引用了规格里不存在的编号", () => {
    const errors = checkSpecTrace(
      [GOOD_SPEC],
      { "packages/core/a.test.ts": testFile("RUN-OWNERSHIP-01", "RUN-OWNERSHIP-77") },
      "",
    );
    expect(errors.join()).toContain(
      "packages/core/a.test.ts:2 测试标题引用了规格里不存在的编号 RUN-OWNERSHIP-77",
    );
  });

  it("场景没有编号、编号重复、前缀和路径对不上", () => {
    const bad = spec(
      `#### Scenario: 没有编号的场景\n- 验证：test\n\n${scenario("RUN-OWNERSHIP-01")}\n${scenario("RUN-OWNERSHIP-01")}\n${scenario("RUN-LOGS-01")}`,
    );
    const errors = checkSpecTrace([bad], {}, "RUN-OWNERSHIP-01\nRUN-LOGS-01\n").join("\n");
    expect(errors).toContain("场景标题没有编号");
    expect(errors).toContain("编号 RUN-OWNERSHIP-01 与 openspec/specs/run/ownership/spec.md:");
    expect(errors).toContain(
      "编号 RUN-LOGS-01 的前缀和能力路径 run/ownership 对不上。前缀应是 RUN-OWNERSHIP",
    );
  });

  it("缺“验证：”一行；manual 没写原因", () => {
    const bad = spec(
      `${scenario("RUN-OWNERSHIP-01", "")}\n${scenario("RUN-OWNERSHIP-02", "- 验证：manual")}`,
    );
    const errors = checkSpecTrace([bad], {}, "").join("\n");
    expect(errors).toContain("场景最后没有“验证：”一行");
    expect(errors).toContain("“验证：manual”后面没写原因");
  });

  it("两级以上的能力路径：library/auto-clean 的前缀是 LIBRARY-AUTO-CLEAN", () => {
    const nested = spec(scenario("LIBRARY-AUTO-CLEAN-26"), "library/auto-clean");
    expect(
      checkSpecTrace([nested], { "a.test.ts": testFile("LIBRARY-AUTO-CLEAN-26") }, ""),
    ).toEqual([]);
  });

  it("只看测试标题；一段前缀的记号和注释里的编号不算引用", () => {
    const files = {
      "a.test.ts": `// ${tag("RUN-OWNERSHIP-01")} 只在注释里\nit("${tag("X-01")} 别处的记号", () => {});\nit("${tag("RUN-OWNERSHIP-02")} 真的", () => {});\n`,
    };
    expect([...referencedIds(files).keys()]).toEqual(["RUN-OWNERSHIP-02"]);
  });

  it("待实现清单的写法：非编号和重复行报错", () => {
    const { errors } = parsePending("不是编号\nRUN-OWNERSHIP-01\nRUN-OWNERSHIP-01\n# 注释\n");
    expect(errors).toHaveLength(2);
  });

  it("整个仓库扫描：规格、测试、清单一起核对", () => {
    const text = `# 规格\n\n## Purpose\n用途。\n\n## Requirements\n\n### Requirement: 要求\n正文 MUST 成立。\n来源：实现细节\n\n${scenario("RUN-OWNERSHIP-01")}\n${scenario("RUN-OWNERSHIP-02")}`;
    const root = makeRepo({
      "openspec/specs/run/ownership/spec.md": text,
      "packages/core/src/a.test.ts": testFile("RUN-OWNERSHIP-01"),
      "tooling/checks/spec-pending.txt": "RUN-OWNERSHIP-02\n",
    });
    expect(specTrace.run(root)).toEqual([]);
    const missing = makeRepo({ "openspec/specs/run/ownership/spec.md": text });
    expect(specTrace.run(missing)).toHaveLength(2);
  });
});

describe("正式 Playwright 端到端测试的规格追踪", () => {
  const source = `# 规格\n\n## Requirements\n\n### Requirement: 要求\n正文 MUST 成立。\n来源：实现细节\n\n${scenario("DESKTOP-EDITOR-51")}`;
  const repo = (path: string, ids = ["DESKTOP-EDITOR-51"], pending = "") =>
    makeRepo({
      "openspec/specs/desktop/editor/spec.md": source,
      [path]: testFile(...ids).replaceAll("it(", "test("),
      "tooling/checks/spec-pending.txt": pending,
    });
  it("正式 e2e 文件中的真实测试标题算覆盖", () => {
    expect(specTrace.run(repo("apps/desktop/e2e/external.e2e.ts"))).toEqual([]);
  });
  it("e2e 引用未知编号仍报错，已有覆盖仍不能留在 pending", () => {
    expect(
      specTrace
        .run(repo("apps/desktop/e2e/external.e2e.ts", ["DESKTOP-EDITOR-51", "DESKTOP-EDITOR-999"]))
        .join(),
    ).toContain("规格里不存在的编号 DESKTOP-EDITOR-999");
    expect(
      specTrace
        .run(repo("apps/desktop/e2e/external.e2e.ts", undefined, "DESKTOP-EDITOR-51\n"))
        .join(),
    ).toContain("已经有测试");
  });
  it.each([
    "apps/desktop/e2e/external.measure.ts",
    "apps/desktop/e2e/external.fixture.ts",
    "apps/desktop/e2e/external.ts",
    "apps/desktop/e2e/support/external.e2e.ts",
    "apps/other/e2e/external.e2e.ts",
    "tooling/scripts/external.e2e.ts",
  ])("不把非正式端到端入口 %s 算作覆盖", (path) => {
    expect(specTrace.run(repo(path)).join()).toContain("但没有测试的标题引用它");
  });
});
