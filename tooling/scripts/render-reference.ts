import type { ZodType } from "zod";
import type {
  EventDefinition,
  MethodDefinition,
  MethodGroup,
} from "../../packages/protocol/src/index.ts";
import { convert, fieldsTable, type JsonSchema, typeText } from "./schema-doc.ts";

// 协议参考文档：从 @runyard/protocol 的登记表生成 docs/reference/ 里的两份文件。
// 形状的唯一出处是 zod 定义；文档不手写，generated-fresh 检查保证它没有过期。

interface CodeDefinition {
  exit?: number;
  params: ZodType;
}

export interface ProtocolDefs {
  methods: Record<string, MethodDefinition>;
  events: Record<string, EventDefinition>;
  errors: Record<string, CodeDefinition & { exit: number }>;
  notices: Record<string, CodeDefinition>;
  // 枚举：常量名到取值
  enums: Record<string, readonly string[]>;
}

export const REFERENCE_FILES = ["docs/reference/protocol.md", "docs/reference/codes.md"] as const;

const HEADER = [
  "<!-- 生成文件：由 pnpm generate 从 packages/protocol 的 zod 定义生成，不要手改。 -->",
  "<!-- 要改内容，改 packages/protocol 里的定义，再运行 pnpm generate。 -->",
].join("\n");

const GROUP_TITLES: Record<MethodGroup, string> = {
  session: "会话",
  events: "事件订阅",
  library: "资源库",
  run: "运行",
  logs: "日志",
  toolchain: "工具链",
  settings: "设置",
  request: "请求面板",
};

// 表格单元格里的竖线要转义，否则联合类型会把表格拆开
const code = (text: string) => `\`${text.replaceAll("|", "\\|")}\``;

function renderMethod(name: string, def: MethodDefinition, defs: Record<string, JsonSchema>) {
  const params = convert(def.params, "input");
  const result = convert(def.result, "output");
  Object.assign(defs, params.defs, result.defs);
  const lines = [`#### ${code(name)}`, "", def.summary, ""];
  if (def.status === "reserved") {
    lines.push("只占名字：形状和行为等对应规格批准后再定，现在回 `NOT_SUPPORTED`。", "");
    return lines;
  }
  lines.push(
    "入参：",
    "",
    fieldsTable(params.schema, defs),
    "",
    "出参：",
    "",
    fieldsTable(result.schema, defs),
    "",
  );
  if (def.errors.length > 0) lines.push(`可能返回的错误码：${def.errors.map(code).join("、")}`, "");
  return lines;
}

function renderEvent(name: string, def: EventDefinition, defs: Record<string, JsonSchema>) {
  const data = convert(def.data, "output");
  Object.assign(defs, data.defs);
  const via =
    def.topic === null
      ? "还没有人能订阅"
      : def.topic === "logs.follow"
        ? "经 `logs.follow` 订阅"
        : `经 \`events.subscribe\` 订阅主题 \`${def.topic}\``;
  const lines = [`#### ${code(name)}`, "", `${def.summary}。${via}。`, ""];
  if (def.status === "reserved") return [...lines, "只占名字：数据形状等对应规格批准后再定。", ""];
  return [...lines, "数据：", "", fieldsTable(data.schema, defs), ""];
}

function renderShared(defs: Record<string, JsonSchema>): string[] {
  const lines = ["## 共用类型", ""];
  for (const name of Object.keys(defs).sort()) {
    const node = defs[name] as JsonSchema;
    // 提示码和参数的全表在 codes.md，这里不重复
    const body =
      name === "Notice"
        ? "`{ code, params }`；已登记的提示码和参数见 [codes.md](codes.md)。"
        : fieldsTable(node, defs);
    lines.push(`### ${code(name)}`, "", body, "");
  }
  return lines;
}

export function renderProtocol(protocol: ProtocolDefs): string {
  const defs: Record<string, JsonSchema> = {};
  const methodLines: string[] = ["## 方法", ""];
  for (const group of Object.keys(GROUP_TITLES) as MethodGroup[]) {
    const members = Object.entries(protocol.methods).filter(([, def]) => def.group === group);
    if (members.length === 0) continue;
    methodLines.push(`### ${GROUP_TITLES[group]}`, "");
    for (const [name, def] of members) methodLines.push(...renderMethod(name, def, defs));
  }
  const eventLines: string[] = ["## 事件", ""];
  for (const [name, def] of Object.entries(protocol.events)) {
    eventLines.push(...renderEvent(name, def, defs));
  }
  return [
    HEADER,
    "",
    "# 协议参考：方法和事件",
    "",
    "传输、握手、信封见 [protocol.md](../architecture/protocol.md)；为什么这样设计见 [protocol-methods.md](../architecture/protocol-methods.md)。",
    "“必填”为否的字段可以省略；接收方忽略不认识的字段。所有方法在入参不合法时返回 `USAGE`，出了意外返回 `INTERNAL`，下面只列各方法特有的错误码。握手帧 `challenge`、`hello` 不是方法，见 protocol.md 第 2 节。",
    "",
    ...methodLines,
    ...eventLines,
    ...renderShared(defs),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

function paramsText(schema: ZodType): string {
  const { schema: json } = convert(schema, "output");
  const text = typeText(json);
  return text === "{}" ? "无" : code(text);
}

export function renderCodes(protocol: ProtocolDefs): string {
  const errorRows = Object.entries(protocol.errors).map(
    ([name, def]) => `| ${def.exit} | ${code(name)} | ${paramsText(def.params)} |`,
  );
  const exits = new Map<number, string[]>();
  for (const [name, def] of Object.entries(protocol.errors)) {
    exits.set(def.exit, [...(exits.get(def.exit) ?? []), name]);
  }
  const exitRows = [...exits.entries()]
    .sort(([a], [b]) => a - b)
    .map(([exit, names]) => `| ${exit} | ${names.map(code).join("、")} |`);
  const noticeRows = Object.entries(protocol.notices).map(
    ([name, def]) => `| ${code(name)} | ${paramsText(def.params)} |`,
  );
  const enumRows = Object.entries(protocol.enums).map(
    ([name, values]) => `| ${code(name)} | ${values.map(code).join("、")} |`,
  );
  return [
    HEADER,
    "",
    "# 登记表：错误码、退出码、提示码、枚举",
    "",
    "代码一旦发布不改名、不复用，只许新增（见 [protocol.md](../architecture/protocol.md) 第 4 节）。参数只放可序列化的简单值，没有句子；给人看的文字在文案包里。",
    "",
    "## 错误码",
    "",
    "| 退出码 | 错误码 | 参数 |",
    "| --- | --- | --- |",
    ...errorRows,
    "",
    "## 退出码",
    "",
    "| 退出码 | 错误码 |",
    "| --- | --- |",
    ...exitRows,
    "",
    "## 提示码",
    "",
    "| 提示码 | 参数 |",
    "| --- | --- |",
    ...noticeRows,
    "",
    "## 枚举",
    "",
    "| 常量 | 取值 |",
    "| --- | --- |",
    ...enumRows,
    "",
  ].join("\n");
}
