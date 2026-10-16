import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ThemeChoice, WorkbenchLocale } from "../workbench/params.ts";

// 截图矩阵（技术设计 §6.7）：浅色 × 中文、浅色 × 英文、深色 × 中文、深色 × 英文、浅色 × 伪语言。
// 第一版没有只属于 Windows 的组件，所以没有平台变体。

export interface Combination {
  theme: Exclude<ThemeChoice, "system">;
  locale: WorkbenchLocale;
}

export const combinations: readonly Combination[] = [
  { theme: "light", locale: "zh-CN" },
  { theme: "light", locale: "en" },
  { theme: "dark", locale: "zh-CN" },
  { theme: "dark", locale: "en" },
  { theme: "light", locale: "en-XA" },
];

/** 基准图文件名：一个组件一种组合一张整表图 */
export function snapshotName(component: string, combination: Combination): string {
  // 用连字符：Playwright 会把文件名里的点改成连字符，自己先写成一样的，路径才对得上
  return `${component}-${combination.theme}-${combination.locale}.png`;
}

/**
 * 有哪些组件要截图：读样例文件的文件名。
 * 为什么不直接导入 workbench/registry.ts：它会拖进 CSS Modules，Playwright 的 Node 进程不认；
 * registry.test.ts 已经保证“每个样例文件都登记了”，所以文件名就是组件名。
 */
export function listComponents(srcDir: string): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else {
        const match = /^(.+)\.fixture\.tsx$/.exec(entry.name);
        if (match?.[1] !== undefined) names.push(match[1]);
      }
    }
  };
  walk(srcDir);
  return names.sort();
}
