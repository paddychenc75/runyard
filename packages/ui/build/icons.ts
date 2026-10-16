import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 图标表生成（技术设计 §6.7“图标”）：src/icons/svg/*.svg → src/icons/generated/icon-paths.ts。
// 源文件只许 <path>：这样生成物是纯数据，Icon 用 React 元素画出来，不用 dangerouslySetInnerHTML。
// 颜色只许 currentColor（和 none），所以图标颜色永远跟随所在位置的文字颜色。

export const ICON_VIEW_BOXES = ["0 0 16 16", "0 0 24 24"] as const;
const FIX = "见 docs/guides/add-ui-component.md 的“图标”一节（技术设计 §6.7）";

export interface IconSource {
  name: string;
  viewBox: string;
  paths: string[];
}

export class IconSourceError extends Error {}

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    attributes.set(match[1] ?? "", match[2] ?? "");
  }
  return attributes;
}

// 解析并校验一份图标源文件；不合规格抛 IconSourceError，信息里带文件名
export function parseIconSource(file: string, text: string): IconSource {
  const fail = (reason: string): never => {
    throw new IconSourceError(`${file}：${reason}。${FIX}`);
  };
  const name = file.replace(/\.svg$/, "");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
    fail("文件名要用小写英文和连字符");
  }
  if (/\sstyle\s*=/.test(text)) fail("不许有内联样式 style");
  const root = /<svg\b([^>]*)>/.exec(text);
  if (root === null) return fail("找不到 <svg> 根元素");
  const rootAttributes = attributesOf(root[1] ?? "");
  const viewBox = rootAttributes.get("viewBox") ?? "";
  if (!(ICON_VIEW_BOXES as readonly string[]).includes(viewBox)) {
    fail(`viewBox 必须是 ${ICON_VIEW_BOXES.join(" 或 ")}（现在是 ${viewBox || "没有"}）`);
  }
  // 除 currentColor 和 none 外不许有颜色：看 fill 和 stroke 两个属性
  for (const [tag, attributes] of [
    ["svg", rootAttributes],
    ...[...text.matchAll(/<path\b([^>]*)>/g)].map(
      (m) => ["path", attributesOf(m[1] ?? "")] as const,
    ),
  ] as const) {
    for (const key of ["fill", "stroke"]) {
      const value = attributes.get(key);
      if (value !== undefined && value !== "currentColor" && value !== "none") {
        fail(`<${tag}> 的 ${key}="${value}" 不许写具体颜色，只能是 currentColor 或 none`);
      }
    }
  }
  const body = text.slice((root.index ?? 0) + root[0].length).replace(/<\/svg>\s*$/, "");
  const elements = [...body.matchAll(/<\s*([a-zA-Z]+)\b([^>]*)>/g)];
  const paths: string[] = [];
  for (const element of elements) {
    if (element[1] !== "path") fail(`只许 <path> 元素，不许 <${element[1]}>（圆和线先转成路径）`);
    const d = attributesOf(element[2] ?? "").get("d");
    if (d === undefined || d === "") fail("<path> 缺 d 属性");
    paths.push(d ?? "");
  }
  if (paths.length === 0) fail("没有任何 <path>");
  return { name, viewBox, paths };
}

function renderPaths(paths: string[]): string {
  const quoted = paths.map((d) => JSON.stringify(d));
  const oneLine = `    paths: [${quoted.join(", ")}],`;
  // 排版要和 Biome 一致（pnpm lint 也检查生成物）：一行放得下就一行，放不下每项一行
  if (oneLine.length <= 100) return oneLine;
  return `    paths: [\n${quoted.map((q) => `      ${q},`).join("\n")}\n    ],`;
}

export function renderIconTable(icons: IconSource[]): string {
  const entries = icons
    .map(
      (icon) =>
        `  ${/^[a-z]+$/.test(icon.name) ? icon.name : JSON.stringify(icon.name)}: {\n    viewBox: ${JSON.stringify(icon.viewBox)},\n${renderPaths(icon.paths)}\n  },`,
    )
    .join("\n");
  return `// 由 pnpm icons:build 生成，不要手改。来源：src/icons/svg/*.svg（技术设计 §6.7）。

export const iconPaths = {
${entries}
} as const;

export type IconName = keyof typeof iconPaths;
`;
}

export const ICON_TABLE = "src/icons/generated/icon-paths.ts";

// 读 svg 目录，返回应有的图标表全文；不写盘
export function buildIconTable(packageDir: string): string {
  const dir = join(packageDir, "src/icons/svg");
  const icons = readdirSync(dir)
    .filter((file) => file.endsWith(".svg"))
    .sort()
    .map((file) => parseIconSource(file, readFileSync(join(dir, file), "utf8")));
  return renderIconTable(icons);
}

// pnpm icons:build / pnpm --filter @runyard/ui build
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  writeFileSync(join(packageDir, ICON_TABLE), buildIconTable(packageDir));
  process.stdout.write(`已更新 packages/ui/${ICON_TABLE}\n`);
}
