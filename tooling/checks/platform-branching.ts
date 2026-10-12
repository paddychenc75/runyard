import { listFiles, readText } from "./docs.ts";
import { checkProcessAndSeparators } from "./platform-branching-syntax.ts";
import type { Check } from "./workspace.ts";

// platform-branching：系统分支只许写在 packages/platform 和桌面应用主进程的 integration 目录
//（技术设计 §3.3、决策记录 0003、0013）。其他地方调用平台接口，不自己判断系统。
// 查 packages/ 和 apps/ 下的源码，包括测试文件：测试也不许写 `if (process.platform …)`，
// 需要平台实现的测试用文件名后缀 `.platform-dependent.test.ts` 标记（docs/guides/testing.md）。
// tooling/ 不查：检查脚本自己要谈论这些写法，共用的 Vitest 配置里有那唯一一处合法的判断，
// 脚本和 CI 入口也本来就要启动 git、pnpm 等进程（见 platform-branching-syntax.ts）。
// 直接启动进程（child_process）和手写路径分隔符两类写法用语法树查，规则和排除项写在 platform-branching-syntax.ts。

const SCANNED_ROOTS = ["packages/", "apps/"];
const ALLOWED_PREFIXES = ["packages/platform/", "apps/desktop/src/main/integration/"];
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// 读取运行系统的写法
const WRITTEN_AS: { pattern: RegExp; what: string }[] = [
  {
    pattern: /\bprocess\s*(?:\.\s*platform\b|\[\s*["'`]platform["'`]\s*\])/,
    what: "process.platform",
  },
  { pattern: /\bprocess\s*\.\s*getSystemVersion\b/, what: "process.getSystemVersion" },
  {
    pattern: /\bos\s*\.\s*(?:platform|type|release|version)\s*\(/,
    what: "os.platform()、os.type() 一类",
  },
  {
    pattern:
      /import\s*\{[^}]*\b(?:platform|type|release|version)\b[^}]*\}\s*from\s*["'](?:node:)?os["']/,
    what: "从 node:os 导入 platform、type、release、version",
  },
  {
    pattern: /\bnavigator\s*\.\s*(?:platform|userAgentData|userAgent)\b/,
    what: "navigator.platform 一类",
  },
];

export function isAllowed(file: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

export function checkBranching(file: string, text: string): string[] {
  const errors: string[] = [];
  const lines = text.split("\n");
  // 整行注释和块注释的内部不算；一行里的行尾注释先去掉
  let inBlock = false;
  lines.forEach((raw, index) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      inBlock = false;
      line = line.slice(end + 2);
    }
    line = line.replace(/\/\*.*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    line = line.replace(/\/\/.*$/, "");
    for (const { pattern, what } of WRITTEN_AS) {
      if (!pattern.test(line)) continue;
      errors.push(
        `${file}:${index + 1} 读取了运行系统（${what}）。系统分支只许写在 packages/platform 里：改调 getPlatform() 返回的接口，缺的能力加进 Platform 接口；需要平台实现的测试把文件改名为 *.platform-dependent.test.ts。见 docs/guides/testing.md。`,
      );
    }
  });
  return errors;
}

export const platformBranching: Check = {
  name: "platform-branching",
  run(root) {
    return listFiles(root)
      .filter(
        (file) =>
          SCANNED_ROOTS.some((prefix) => file.startsWith(prefix)) &&
          SOURCE_FILE.test(file) &&
          !isAllowed(file),
      )
      .flatMap((file) => {
        const text = readText(root, file);
        return [...checkBranching(file, text), ...checkProcessAndSeparators(file, text)];
      });
  },
};
