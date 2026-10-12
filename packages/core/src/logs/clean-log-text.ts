import type { LogEntry } from "@runyard/protocol";

// 读取时的九条清洗规则（决策记录 0008，证据 6.2）。规则 1、3 在写入时已做（切行、解码）。
// 纯函数、幂等：输出里不再有 ESC、回车、退格和控制字符，所以再清洗一次不变。

const ESC = "\u001b";

// 光标到第 1 列，等同回车（规则 5）
const COLUMN_ONE = new RegExp(`${ESC}\\[[01]?G`, "g");

// 规则 6，按优先级排：OSC/DCS/SOS/PM/APC 字符串（BEL、ESC \ 或 ST 结尾，未结束的吃到行尾）、
// CSI（含 8 位形式；结束字节缺失也吃掉已有参数）、ESC 加中间字节加一个字符。
const ESCAPE_SEQUENCES = new RegExp(
  [
    `(?:${ESC}[\\]PX^_]|[\\u0090\\u0098\\u009d\\u009e\\u009f])[\\s\\S]*?(?:\\u0007|${ESC}\\\\|\\u009c|$)`,
    `(?:${ESC}\\[|\\u009b)[0-?]*[ -/]*[@-~]?`,
    `${ESC}[ -/]*[0-~]?`,
  ].join("|"),
  "g",
);

// 规则 8：除制表符外的 C0、DEL、C1（含残留的 ESC）。逐个判断码点，不写控制字符正则
function isControl(code: number): boolean {
  return (code <= 0x1f && code !== 0x09) || (code >= 0x7f && code <= 0x9f);
}

function deleteControlChars(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    if (!isControl(text.charCodeAt(i))) out += text[i];
  }
  return out;
}

// 用码点写，避免源文件里出现看不见的字符
const BOM = String.fromCodePoint(0xfeff);

function stripLeadingBom(text: string): string {
  let i = 0;
  while (text.startsWith(BOM, i)) i += 1;
  return text.slice(i);
}

function lastNonEmptySegment(text: string): string {
  const segments = text.split("\r");
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment !== undefined && segment !== "") return segment;
  }
  return "";
}

// 退格删前一个字符；按码点删，不把代理对删成半个
function applyBackspace(text: string): string {
  if (!text.includes("\b")) return text;
  const out: string[] = [];
  for (const char of text) {
    if (char === "\b") out.pop();
    else out.push(char);
  }
  return out.join("");
}

/** 清洗一行；整行都是控制序列（清洗前非空、清洗后为空）时返回 null，表示丢弃。 */
export function cleanLogText(text: string): string | null {
  if (text === "") return "";
  let s = text.endsWith("\r") ? text.slice(0, -1) : text;
  s = stripLeadingBom(s);
  s = s.replace(COLUMN_ONE, "\r");
  s = s.replace(ESCAPE_SEQUENCES, "");
  s = lastNonEmptySegment(s);
  s = applyBackspace(s);
  s = deleteControlChars(s);
  // 去掉转义序列或回车之后才露出来的开头标记，否则再清洗一次会不同
  s = stripLeadingBom(s);
  return s === "" ? null : s;
}

/**
 * 清洗一批条目：stdout、stderr 的 text 按九条规则清洗，纯控制序列的行丢弃；
 * 命令行和系统提示是管理进程自己写的，原样保留。
 */
export function cleanLogEntries(entries: readonly LogEntry[]): LogEntry[] {
  const result: LogEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "stdout" || entry.kind === "stderr") {
      const text = cleanLogText(entry.text);
      if (text !== null) result.push({ ...entry, text });
    } else {
      result.push(entry);
    }
  }
  return result;
}
