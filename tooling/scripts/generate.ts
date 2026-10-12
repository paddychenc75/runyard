import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as protocol from "../../packages/protocol/src/index.ts";
import { type ProtocolDefs, renderCodes, renderProtocol } from "./render-reference.ts";

// pnpm generate：重新生成“由别的文件推导出来”的文档内容，保证只有一个出处。
// 两类生成物：
// 1. 根 AGENTS.md 里的包依赖表，来自 tooling/checks/layers.json（技术设计 §3.3），只替换两行标记之间。
// 2. docs/reference/ 里的协议参考和登记表，来自 packages/protocol 的 zod 定义，整个文件都是生成的。
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
  /** 重新生成前后是否一致；文件不存在也算不一致 */
  fresh: boolean;
  /** true：整个文件都是生成的；false：只有标记之间是 */
  whole: boolean;
}

// 协议的当前定义，参考文档从它生成。测试可以传一份改过的，证明定义变了生成物就过期
export const protocolDefs: ProtocolDefs = {
  methods: protocol.methodRegistry,
  events: protocol.eventRegistry,
  errors: protocol.errorRegistry,
  notices: protocol.noticeRegistry,
  enums: {
    runStates: protocol.runStates,
    envSources: protocol.envSources,
    failureReasons: protocol.failureReasons,
    portFallbackReasons: protocol.portFallbackReasons,
    runKinds: protocol.runKinds,
    toolStatuses: protocol.toolStatuses,
    createdByKinds: protocol.createdByKinds,
    packageManagers: protocol.packageManagers,
    waitModes: protocol.waitModes,
    shutdownReasons: protocol.shutdownReasons,
    eventTopics: protocol.eventTopics,
  },
};

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

function layersFile(root: string): GeneratedFile {
  const path = "AGENTS.md";
  const current = readFileSync(join(root, path), "utf8");
  const content = replaceBlock(current, renderLayersTable(root));
  if (content === undefined) {
    throw new Error(
      `${path} 里找不到生成标记。依赖表要放在这两行之间：\n${BEGIN}\n${END}\n把这两行加回去再运行 pnpm generate。`,
    );
  }
  return { path, content, fresh: content === current, whole: false };
}

function wholeFile(root: string, path: string, content: string): GeneratedFile {
  const full = join(root, path);
  const fresh = existsSync(full) && readFileSync(full, "utf8") === content;
  return { path, content, fresh, whole: true };
}

// 算出每个带生成内容的文件应有的全文；不写盘
export function generate(root: string, defs: ProtocolDefs = protocolDefs): GeneratedFile[] {
  return [
    layersFile(root),
    wholeFile(root, "docs/reference/protocol.md", renderProtocol(defs)),
    wholeFile(root, "docs/reference/codes.md", renderCodes(defs)),
  ];
}

// 把过期的生成物写盘（目录不存在就建）；返回写了哪些
export function writeGenerated(root: string, files: GeneratedFile[]): string[] {
  const written: string[] = [];
  for (const file of files) {
    if (file.fresh) continue;
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
    written.push(file.path);
  }
  return written;
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..");
  const files = generate(root);
  writeGenerated(root, files);
  for (const file of files) console.log(`${file.fresh ? "未变" : "已更新"}  ${file.path}`);
}
