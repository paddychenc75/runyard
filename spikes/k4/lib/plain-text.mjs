// “给智能体看的纯文本”流水线（技术设计 §4.5、PRD 的 runyard logs）。
// 规则只依赖字节：先按 0x0A 切行（UTF-8 和 GBK 的多字节内部都不会出现 0x0A），
// 再对每一整行解码和清洗，所以控制序列、汉字被拆在两个数据块之间都不会出错。

const utf8Strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const gb18030 = new TextDecoder("gb18030"); // GBK 的超集，Node 自带的完整 ICU 支持

// 控制序列：顺序重要，OSC / DCS 等字符串序列必须排在“ESC 加一个字符”之前。
const ANSI = new RegExp(
  [
    "\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)", // OSC，含超链接 ESC ] 8 ;; url BEL
    "\\u001b\\][^\\u0007\\u001b]*$", // 没有结尾的 OSC：吃到行尾
    "\\u001b[PX^_][^\\u001b]*(?:\\u001b\\\\)", // DCS / SOS / PM / APC
    "\\u001b\\[[0-?]*[ -/]*[@-~]", // CSI：颜色、光标移动、清屏、私有模式
    "\\u001b[ -/]+[0-~]", // ESC ( B 一类的字符集切换
    "\\u001b[0-~]", // ESC 7 / ESC 8 / ESC = / ESC c 等
    "\\u009b[0-?]*[ -/]*[@-~]", // 8 位 CSI（解码后）
  ].join("|"),
  "g",
);
// 一类等价于回车的“光标移到第 1 列”：pnpm、ora 这类库用它重画同一行
const CURSOR_COL1 = /\u001b\[[01]?G/g;
const LEFTOVER_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/** 解码一整行字节：先严格 UTF-8，失败则按 GB18030（中文 Windows 的代码页 936）。 */
export function decodeLine(buf) {
  try {
    return { text: utf8Strict.decode(buf), encoding: "utf-8" };
  } catch {
    return { text: gb18030.decode(buf), encoding: "gb18030" };
  }
}

/** 清洗一整行文本（不含结尾的换行）。返回 null 表示“这一行只有控制序列，丢掉”。 */
export function cleanLine(text) {
  const original = text;
  text = text.replace(/^﻿/, ""); // PowerShell 等写出的 BOM
  text = text.replace(CURSOR_COL1, "\r");
  text = text.replace(ANSI, "");
  // 回车重画：同一行里多次 \r，只留最后一段非空内容（最终状态）
  if (text.includes("\r")) {
    const segs = text.split("\r").filter((s) => s.trim() !== "");
    text = segs.length ? segs[segs.length - 1] : "";
  }
  // 退格：删掉前一个字符
  while (/[^\u0008]\u0008/.test(text)) text = text.replace(/[^\u0008]\u0008/, "");
  text = text.replace(LEFTOVER_CONTROLS, "");
  if (text.trim() === "" && original.trim() !== "") return null;
  return text;
}

/**
 * 把按到达顺序排好的数据块（{ t, src, buf }）转成日志行。
 * 每个来源各自累积未结束的半行；进程结束时把半行也输出（flushPartial）。
 */
export function toPlainLines(chunks) {
  const pending = { stdout: [], stderr: [] };
  const lines = [];
  let seq = 0;
  const emit = (src, parts, t) => {
    let buf = Buffer.concat(parts);
    if (buf.length && buf[buf.length - 1] === 0x0d) buf = buf.subarray(0, -1); // CRLF 的 CR
    const { text, encoding } = decodeLine(buf);
    const clean = cleanLine(text);
    if (clean === null) return;
    lines.push({ seq: ++seq, t, src, text: clean, encoding });
  };
  for (const c of chunks) {
    let rest = c.buf;
    for (;;) {
      const i = rest.indexOf(0x0a);
      if (i < 0) break;
      pending[c.src].push(rest.subarray(0, i));
      emit(c.src, pending[c.src], c.t);
      pending[c.src] = [];
      rest = rest.subarray(i + 1);
    }
    if (rest.length) pending[c.src].push(rest);
  }
  const lastT = chunks.length ? chunks[chunks.length - 1].t : 0;
  for (const src of ["stdout", "stderr"]) {
    if (pending[src].length) emit(src, pending[src], lastT); // flushPartial
  }
  return lines;
}

export function plainText(chunks) {
  return toPlainLines(chunks)
    .map((l) => l.text)
    .join("\n");
}
