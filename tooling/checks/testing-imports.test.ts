import { describe, expect, it } from "vitest";
import { makeRepo } from "./test-helpers.ts";
import { checkTestingImports, testingImports } from "./testing-imports.ts";

describe("checkTestingImports", () => {
  it.each([
    ["静态导入", `import { FakeClock } from "@runyard/testing";`],
    ["只为副作用的导入", `import "@runyard/testing";`],
    ["类型导入", `import type { Clock } from '@runyard/testing';`],
    ["子路径", `import { x } from "@runyard/testing/src/fake-clock.ts";`],
    ["动态导入", `const t = await import("@runyard/testing");`],
    ["require", `const t = require("@runyard/testing");`],
    ["重新导出", `export { FakeClock } from "@runyard/testing";`],
  ])("拦住：%s", (_title, line) => {
    const errors = checkTestingImports("packages/core/src/a.ts", `\n${line}\n`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/a.ts");
    expect(errors[0]).toContain("0014");
  });

  it("不拦：注释里提到、名字相近的包", () => {
    const text = [
      `// 测试里用 import { x } from "@runyard/testing"`,
      `/* import "@runyard/testing" */`,
      `import { y } from "@runyard/testing-utils";`,
    ].join("\n");
    expect(checkTestingImports("packages/core/src/a.ts", text)).toEqual([]);
  });
});

describe("testing-imports 检查", () => {
  const IMPORT = `import { FakeClock } from "@runyard/testing";\n`;

  it("拦住产品源码，放过测试文件、测试平台依赖的测试文件和 testing 包自己", () => {
    const root = makeRepo({
      "packages/core/src/engine.ts": IMPORT,
      "packages/core/src/engine.test.ts": IMPORT,
      "packages/core/src/engine.platform-dependent.test.ts": IMPORT,
      "packages/testing/src/index.ts": IMPORT,
    });
    const errors = testingImports.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/engine.ts");
  });

  it("桌面应用的非测试源码同样被拦", () => {
    const root = makeRepo({ "apps/desktop/src/main/index.ts": IMPORT });
    expect(testingImports.run(root)).toHaveLength(1);
  });
});
