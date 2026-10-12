import { describe, expect, it } from "vitest";
import { checkBranching, isAllowed, platformBranching } from "./platform-branching.ts";
import { makeRepo } from "./test-helpers.ts";

// 把要查的写法拆开拼，免得这个文件自己带着它们
const PROCESS_PLATFORM = ["process", "platform"].join(".");
const OS_PLATFORM = ["os", "platform()"].join(".");

describe("checkBranching", () => {
  it("没有系统判断时通过", () => {
    expect(checkBranching("a.ts", `const p = getPlatform();\nif (p.id === "darwin") {}\n`)).toEqual(
      [],
    );
  });

  it.each([
    ["process 点 platform", `if (${PROCESS_PLATFORM} === "win32") {}`],
    ["process 方括号 platform", `const x = process["platform"];`],
    ["process.getSystemVersion", `const v = process.getSystemVersion();`],
    ["os 点 platform()", `const x = ${OS_PLATFORM};`],
    ["os.type()", `const x = os.type();`],
    ["从 node:os 导入 platform", `import { homedir, platform } from "node:os";`],
    ["从 os 导入 release", `import { release } from 'os';`],
    ["navigator.platform", `const x = navigator.platform;`],
    ["navigator.userAgent", `const x = navigator.userAgent;`],
  ])("拦住：%s", (_title, line) => {
    const errors = checkBranching("src/a.ts", `\n${line}\n`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("src/a.ts:2");
    expect(errors[0]).toContain("docs/guides/testing.md");
  });

  it("不拦：注释里提到、只导入不相干的 os 函数", () => {
    const text = [
      `// 不要用 ${PROCESS_PLATFORM}`,
      `/* ${OS_PLATFORM} 也不要 */`,
      `/**`,
      ` * ${PROCESS_PLATFORM}`,
      ` */`,
      `const x = 1; // ${PROCESS_PLATFORM}`,
      `import { homedir, tmpdir } from "node:os";`,
    ].join("\n");
    expect(checkBranching("a.ts", text)).toEqual([]);
  });

  it("块注释结束的同一行里的代码仍然要查", () => {
    expect(checkBranching("a.ts", `/*\n*/ const x = ${PROCESS_PLATFORM};`)).toHaveLength(1);
  });
});

describe("platformBranching 检查", () => {
  const bad = `export const host = ${PROCESS_PLATFORM};\n`;

  it("允许 packages/platform 和桌面应用主进程的 integration 目录", () => {
    expect(isAllowed("packages/platform/src/get-platform.ts")).toBe(true);
    expect(isAllowed("apps/desktop/src/main/integration/darwin.ts")).toBe(true);
    expect(isAllowed("packages/platform-extra/src/a.ts")).toBe(false);
    expect(isAllowed("apps/desktop/src/main/index.ts")).toBe(false);
  });

  it("别的包里的业务代码和测试文件都被拦住（失败样例）", () => {
    const root = makeRepo({
      "packages/core/src/run.ts": bad,
      "packages/core/src/run.test.ts": `it("x", () => { if (${PROCESS_PLATFORM} === "win32") return; });\n`,
      "apps/desktop/src/main/index.ts": bad,
    });
    const errors = platformBranching.run(root);
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toContain("packages/core/src/run.ts:1");
    expect(errors.join("\n")).toContain("packages/core/src/run.test.ts:1");
  });

  it("允许的目录里不拦；非源码文件不查", () => {
    const root = makeRepo({
      "packages/platform/src/get-platform.ts": bad,
      "apps/desktop/src/main/integration/darwin.ts": bad,
      "packages/core/AGENTS.md": `不要写 ${PROCESS_PLATFORM}\n`,
      "tooling/vitest/base.ts": bad,
    });
    expect(platformBranching.run(root)).toEqual([]);
  });
});
