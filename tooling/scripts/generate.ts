import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { buildMessagesTypes } from "../../packages/i18n/build/build.ts";
import { renderStrings } from "../../packages/i18n/build/render-strings.ts";
import * as protocol from "../../packages/protocol/src/index.ts";
import {
  buildTokens,
  replaceDocBlock as replaceTokensDoc,
  DOC_FILE as TOKENS_DOC,
  GENERATED_FILES as TOKENS_FILES,
} from "../../packages/tokens/build/build.ts";
import { fallbackLocale, readCatalogs, sourceLocale } from "../checks/i18n-catalogs.ts";
import { formatJson } from "./format-json.ts";
import { type ProtocolDefs, renderCodes, renderProtocol } from "./render-reference.ts";

// pnpm generate：重新生成“由别的文件推导出来”的文档内容，保证只有一个出处。
// 三类生成物：
// 1. 根 AGENTS.md 里的包依赖表，来自 tooling/checks/layers.json（技术设计 §3.3），只替换两行标记之间。
// 2. docs/reference/ 里的协议参考和登记表，来自 packages/protocol 的 zod 定义，整个文件都是生成的。
// 3. templates/schema/ 下的 JSON Schema（模板、运行器、工具定义），来自 packages/protocol 的 zod 定义。
//    写模板的人和编辑器用它；以 zod 为准，这里只是从它推出来。
// 4. 国际化：packages/i18n/generated/messages.d.ts（键和参数类型，来自中文文案）和 docs/reference/strings.md
//    （一行一个键的文案对照表，来自 locales/）。pnpm i18n:build 只生成前者；pnpm generate 两个都生成。
// 5. 设计变量：packages/tokens/generated/ 下的 tokens.css、tokens.ts、editor-themes.ts，
//    和 docs/design/tokens.md 里两个标记之间的表格，来自 packages/tokens/src/tokens.json。pnpm tokens:build 做同样的事。
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
    dataFileKinds: protocol.dataFileKinds,
    eventTopics: protocol.eventTopics,
  },
};

// 手写模板、运行器、工具定义的人面对的是“写什么”，所以用 input 一侧：带默认值的字段可以省略
export const jsonSchemas: Record<string, unknown> = {
  "templates/schema/template.schema.json": protocol.templateSchema,
  "templates/schema/runner.schema.json": protocol.runnerSchema,
  "templates/schema/tool.schema.json": protocol.toolDefinitionSchema,
};

export function renderJsonSchema(schema: unknown): string {
  const json = z.toJSONSchema(schema as z.ZodType, { io: "input", unrepresentable: "any" });
  return formatJson(json);
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

function tokensFiles(root: string): GeneratedFile[] {
  const out = buildTokens(join(root, "packages/tokens"));
  const doc = readFileSync(join(root, TOKENS_DOC), "utf8");
  const content = replaceTokensDoc(doc, out.docTables);
  if (content === undefined) {
    throw new Error(
      `${TOKENS_DOC} 里找不到 generated:tokens 的开始和结束标记。把这两行加回去再运行 pnpm generate。`,
    );
  }
  return [
    wholeFile(root, `packages/tokens/${TOKENS_FILES.css}`, out.css),
    wholeFile(root, `packages/tokens/${TOKENS_FILES.ts}`, out.ts),
    wholeFile(root, `packages/tokens/${TOKENS_FILES.editor}`, out.editor),
    { path: TOKENS_DOC, content, fresh: content === doc, whole: false },
  ];
}

// 算出每个带生成内容的文件应有的全文；不写盘
export function generate(root: string, defs: ProtocolDefs = protocolDefs): GeneratedFile[] {
  return [
    layersFile(root),
    wholeFile(root, "docs/reference/protocol.md", renderProtocol(defs)),
    wholeFile(root, "docs/reference/codes.md", renderCodes(defs)),
    ...Object.entries(jsonSchemas).map(([path, schema]) =>
      wholeFile(root, path, renderJsonSchema(schema)),
    ),
    wholeFile(
      root,
      "packages/i18n/generated/messages.d.ts",
      buildMessagesTypes(join(root, "packages/i18n")),
    ),
    wholeFile(
      root,
      "docs/reference/strings.md",
      renderStrings(readCatalogs(root), sourceLocale, fallbackLocale),
    ),
    ...tokensFiles(root),
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
