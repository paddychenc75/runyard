import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeRepo } from "./test-helpers.ts";
import { checkUiLayers, uiLayers } from "./ui-layers.ts";

const RULES_TEXT = readFileSync(join(import.meta.dirname, "ui-layers.json"), "utf8");
const RULES = JSON.parse(RULES_TEXT);
const check = (path: string, code: string) => checkUiLayers(path, code, RULES).join("\n");

const PRIMITIVE = "packages/ui/src/primitives/Button/Button.tsx";
const R = "apps/desktop/src/renderer";

describe("ui-layers：导入方向", () => {
  it("基础组件导入组合组件报错，导入同层和设计变量放行", () => {
    const bad = check(PRIMITIVE, `import { DataTable } from "../../patterns/DataTable/index.ts";`);
    expect(bad).toContain(`${PRIMITIVE}:1 导入了`);
    expect(bad).toContain("基础组件（第 2 层）");
    expect(bad).toContain("ui-layers.json");
    expect(
      check(PRIMITIVE, `import { Icon } from "../Icon/index.ts";\nimport "@runyard/tokens";`),
    ).toBe("");
    // 组合组件可以导入基础组件
    expect(
      check(
        "packages/ui/src/patterns/DataTable/DataTable.tsx",
        `import { Button } from "../../primitives/Button/index.ts";`,
      ),
    ).toBe("");
  });

  it("export … from 和动态 import 同样被查", () => {
    expect(check(PRIMITIVE, `export { X } from "../../patterns/X/index.ts";`)).toContain("导入了");
    expect(check(PRIMITIVE, `const m = await import("../../patterns/X/index.ts");`)).toContain(
      "导入了",
    );
  });

  it("功能模块之间互相导入报错，导入 shared 和自己模块内放行", () => {
    const lib = `${R}/features/library/List.tsx`;
    const bad = check(lib, `import { Tab } from "../workspace/Tab.tsx";`);
    expect(bad).toContain("功能模块 library 导入了功能模块 workspace");
    expect(bad).toContain("renderer/shared/");
    expect(
      check(
        lib,
        `import { a } from "./Row.tsx";\nimport { b } from "../../shared/b.ts";\nimport { c } from "../library/c.ts";`,
      ),
    ).toBe("");
  });

  it("功能模块导入应用外壳、shared 导入功能模块、bridge 导入界面各层都报错", () => {
    expect(
      check(`${R}/features/library/L.tsx`, `import { App } from "../../app/App.tsx";`),
    ).toContain("应用外壳");
    expect(check(`${R}/shared/s.ts`, `import { L } from "../features/library/L.tsx";`)).toContain(
      "shared/",
    );
    expect(check(`${R}/bridge/call.ts`, `import { w } from "../widgets/w.ts";`)).toContain(
      "bridge/",
    );
    expect(check(`${R}/widgets/w.ts`, `import { bridge } from "../bridge/call.ts";`)).toBe("");
    expect(check(`${R}/app/App.tsx`, `import { L } from "../features/library/L.tsx";`)).toBe("");
  });

  it("通用组件包导入 apps/ 报错", () => {
    expect(
      check(PRIMITIVE, `import { x } from "../../../../../apps/desktop/src/shared/x.ts";`),
    ).toContain("不认识应用");
  });
});

describe("ui-layers：预加载接口", () => {
  it("功能模块、外壳、ui 里碰 window.runyard 报错；bridge/ 里放行", () => {
    for (const path of [
      `${R}/features/library/L.tsx`,
      `${R}/app/App.tsx`,
      `${R}/main.ts`,
      PRIMITIVE,
    ]) {
      const out = check(path, `const bridge = window.runyard;`);
      expect(out, path).toContain("预加载接口只许在 apps/desktop/src/renderer/bridge/ 里碰");
    }
    expect(check(`${R}/bridge/desktop-bridge.ts`, `export const get = () => window.runyard;`)).toBe(
      "",
    );
  });

  it('globalThis.runyard、window["runyard"] 也拦；别的属性和测试文件不拦', () => {
    expect(check(`${R}/a.ts`, `const x = globalThis.runyard;`)).toContain("globalThis.runyard");
    expect(check(`${R}/a.ts`, `const x = window["runyard"];`)).toContain("预加载接口");
    expect(check(`${R}/a.ts`, `const x = window.location; const y = foo.runyard;`)).toBe("");
    expect(check(`${R}/a.test.ts`, `window.runyard = fake;`)).toBe("");
    // 类型声明（globals.d.ts 里 interface Window { runyard }）不是访问
    expect(check(`${R}/globals.d.ts`, `interface Window { runyard: unknown }`)).toBe("");
  });
});

describe("ui-layers：命令行输出口（接管 ui-strings 的过渡规则）", () => {
  it("process.stdout.write / stderr.write 只许出现在 packages/cli/src/output/", () => {
    const code = `process.stdout.write("done\\n");\nprocess.stderr.write("x");`;
    const out = check("packages/cli/src/commands/run.ts", code);
    expect(out).toContain("process.stdout.write");
    expect(out).toContain("process.stderr.write");
    expect(out).toContain("out.line()");
    expect(check("packages/cli/src/output/out.ts", code)).toBe("");
  });

  it("写给日志文件的诊断可以带理由放行，没写理由不放行", () => {
    expect(
      check(
        "packages/supervisor/src/run-main.ts",
        `// i18n-allow: 只进日志文件，不显示给用户\nprocess.stderr.write("x");`,
      ),
    ).toBe("");
    expect(
      check("packages/supervisor/src/run-main.ts", `// i18n-allow:\nprocess.stderr.write("x");`),
    ).toContain("process.stderr.write");
  });

  it("测试文件和 src 之外的脚本不查", () => {
    expect(check("packages/cli/src/x.test.ts", `process.stdout.write("a");`)).toBe("");
    expect(check("packages/ui/build/icons.ts", `process.stdout.write("a");`)).toBe("");
  });
});

describe("ui-layers：整个仓库", () => {
  it("扫描 packages/ 和 apps/ 下的代码，规则读自 ui-layers.json", () => {
    const root = makeRepo({
      "tooling/checks/ui-layers.json": RULES_TEXT,
      [PRIMITIVE]: `import { T } from "../../patterns/T/index.ts";\n`,
      "packages/ui/src/patterns/T/index.ts": "export const T = 1;\n",
      [`${R}/features/a/A.tsx`]: `import { B } from "../b/B.tsx";\n`,
      [`${R}/features/b/B.tsx`]: "export const B = 1;\n",
    });
    const errors = uiLayers.run(root);
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toContain(`${PRIMITIVE}:1`);
    expect(errors.join("\n")).toContain("features/a/A.tsx:1");
  });
});
