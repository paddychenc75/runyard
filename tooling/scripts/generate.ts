import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// pnpm generate：重新生成“由别的文件推导出来”的文档内容，保证只有一个出处。
// 目前只有一样：根 AGENTS.md 里的包依赖表，来自 tooling/checks/layers.json（技术设计 §3.3）。
// generated-fresh 检查（tooling/checks/generated-fresh.ts）用同一份代码核对生成物是否最新。

const LAYERS_FILE = "tooling/checks/layers.json";
const BEGIN = "<!-- generated:layers 开始（由 pnpm generate 生成，不要手改） -->";
const END = "<!-- generated:layers 结束 -->";

interface Layers {
  packages: Record<string, { path: string; allow: string[]; devOnly?: string[] }>;
}

export interface GeneratedFile {
  /** 相对仓库根的路径 */
  path: string;
  /** 生成之后文件应有的全文 */
  content: string;
  /** 重新生成前后是否一致 */
  fresh: boolean;
}

// 依赖表：每个包一行，写明可以导入谁、这个包现在建了没有
export function renderLayersTable(root: string): string {
  const layers = JSON.parse(readFileSync(join(root, LAYERS_FILE), "utf8")) as Layers;
  const rows = Object.entries(layers.packages).map(([name, rule]) => {
    const allow = rule.allow.map((dep) =>
      rule.devOnly?.includes(dep) ? `\`${dep}\`（只在测试里）` : `\`${dep}\``,
    );
    const state = existsSync(join(root, rule.path, "package.json")) ? "已有" : "还没建";
    return `| \`${name}\` | ${allow.join("、") || "无"} | ${state} |`;
  });
  return ["| 包 | 可以导入 | 现状 |", "| --- | --- | --- |", ...rows].join("\n");
}

function replaceBlock(text: string, block: string): string | undefined {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${text.slice(0, start)}${BEGIN}\n${block}\n${text.slice(end)}`;
}

// 算出每个带生成内容的文件应有的全文；不写盘
export function generate(root: string): GeneratedFile[] {
  const path = "AGENTS.md";
  const current = readFileSync(join(root, path), "utf8");
  const content = replaceBlock(current, renderLayersTable(root));
  if (content === undefined) {
    throw new Error(
      `${path} 里找不到生成标记。依赖表要放在这两行之间：\n${BEGIN}\n${END}\n把这两行加回去再运行 pnpm generate。`,
    );
  }
  return [{ path, content, fresh: content === current }];
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..");
  for (const file of generate(root)) {
    if (!file.fresh) writeFileSync(join(root, file.path), file.content);
    console.log(`${file.fresh ? "未变" : "已更新"}  ${file.path}`);
  }
}
