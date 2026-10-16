import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ICON_TABLE,
  type IconSource,
  IconSourceError,
  parseIconSource,
  renderIconTable,
} from "../../packages/ui/build/icons.ts";
import type { Check } from "./workspace.ts";

// icons：图标源文件合规，生成的图标表没过期（技术设计 §3.3、§6.7“图标”）。
// 规格（文件名、viewBox、只许 <path>、颜色只许 currentColor、不许内联样式）的唯一实现是
// packages/ui/build/icons.ts 里的 parseIconSource，生成脚本和这里用的是同一份，不会各说各话。

const UI_DIR = "packages/ui";
const SVG_DIR = `${UI_DIR}/src/icons/svg`;

export const icons: Check = {
  name: "icons",
  run(root) {
    const svgDir = join(root, SVG_DIR);
    if (!existsSync(svgDir)) return []; // 还没有 ui 包的仓库（测试用的假仓库）
    const errors: string[] = [];
    const parsed: IconSource[] = [];
    for (const file of readdirSync(svgDir)
      .filter((name) => name.endsWith(".svg"))
      .sort()) {
      try {
        parsed.push(parseIconSource(file, readFileSync(join(svgDir, file), "utf8")));
      } catch (error) {
        if (!(error instanceof IconSourceError)) throw error;
        errors.push(`${SVG_DIR}/${error.message}`);
      }
    }
    if (errors.length > 0) return errors; // 源文件有错时，图标表是否过期没有意义

    const tablePath = join(root, UI_DIR, ICON_TABLE);
    const actual = existsSync(tablePath) ? readFileSync(tablePath, "utf8") : null;
    if (actual !== renderIconTable(parsed)) {
      errors.push(
        `${UI_DIR}/${ICON_TABLE} 过期或不存在（图标源文件改了，或有人手改了它）。运行 pnpm icons:build 重新生成并提交，不要手改这个文件；见 docs/guides/add-ui-component.md 的“图标”一节（技术设计 §6.7）。`,
      );
    }
    return errors;
  },
};
