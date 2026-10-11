// 对原始字节和纯文本做“证据统计”：出现了哪些控制序列、有没有残留、有没有乱码、延迟多大。
import { toPlainLines } from "./plain-text.mjs";

const CENSUS = [
  ["sgr_color", /\u001b\[[0-9;:]*m/g],
  ["csi_erase", /\u001b\[[0-9;]*[JK]/g],
  ["csi_cursor_move", /\u001b\[[0-9;]*[ABCDEFGHfsu]/g],
  ["csi_private_mode", /\u001b\[\?[0-9;]*[a-zA-Z]/g],
  ["osc_hyperlink", /\u001b\]8;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g],
  ["osc_other", /\u001b\](?!8;)[^\u0007\u001b]*(?:\u0007|\u001b\\)/g],
  ["esc_other", /\u001b(?![\[\]])[ -~]/g],
  ["bel", /\u0007/g],
  ["backspace", /\u0008/g],
  ["cr_lone", /\r(?!\n)/g],
  ["crlf", /\r\n/g],
  ["nul", /\u0000/g],
];

/** 在原始字节（按 latin1 看，不丢信息）里数各类序列，并给出每类最多 3 个例子。 */
export function census(chunks) {
  const s = Buffer.concat(chunks.map((c) => c.buf)).toString("latin1");
  const counts = {};
  const examples = {};
  for (const [name, re] of CENSUS) {
    const m = s.match(re) ?? [];
    if (m.length) {
      counts[name] = m.length;
      examples[name] = [...new Set(m)].slice(0, 3).map((x) => JSON.stringify(x));
    }
  }
  const lfOnly = (s.match(/(?<!\r)\n/g) ?? []).length;
  if (lfOnly) counts.lf_only = lfOnly;
  return { counts, examples, rawBytes: s.length };
}

const RESIDUAL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

/** 纯文本是否合格：控制字符残留、U+FFFD、疑似 GBK 当 UTF-8 / UTF-8 当 Latin-1 的乱码。 */
export function textHealth(lines) {
  let residual = 0;
  let fffd = 0;
  let gbkLines = 0;
  let mojibake = 0;
  for (const l of lines) {
    if (RESIDUAL.test(l.text)) residual++;
    if (l.text.includes("�")) fffd++;
    if (l.encoding === "gb18030") gbkLines++;
    // UTF-8 的汉字被当 cp1252/Latin-1 读出来的典型样子（ä¸­æ–‡ 之类）
    if (/[ÃÂä-é][\u0080-¿ŒœŠšŸŽž‘-›]/.test(l.text)) mojibake++;
  }
  return { residualLines: residual, fffdLines: fffd, gbkFallbackLines: gbkLines, mojibakeLines: mojibake };
}

/** 一秒一行的程序：每行自带发出时的时间戳，和到达时间对比。 */
export function tickLatency(chunks, emitRe = /tick (\d+) (\d+)/) {
  const arrivals = [];
  for (const c of chunks) {
    const s = c.buf.toString("utf8");
    for (const m of s.matchAll(new RegExp(emitRe, "g"))) {
      arrivals.push({ i: Number(m[1]), emit: Number(m[2]), arrive: c.epoch });
    }
  }
  const delays = arrivals.map((a) => Math.round(a.arrive - a.emit));
  // 按“到达时刻不同的数据块”算相邻到达间隔
  const times = [...new Set(arrivals.map((a) => Math.round(a.arrive)))];
  const gaps = times.slice(1).map((t, k) => t - times[k]);
  return {
    lines: arrivals.length,
    maxDelayMs: delays.length ? Math.max(...delays) : null,
    medianDelayMs: delays.length ? delays.slice().sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null,
    distinctArrivalInstants: times.length,
    maxInterArrivalGapMs: gaps.length ? Math.max(...gaps) : null,
  };
}

/** seq N out|err：按到达顺序看序号是否单调；返回倒序的个数。 */
export function orderInversions(chunks) {
  const lines = toPlainLines(chunks);
  let inv = 0;
  let prev = 0;
  const seen = [];
  for (const l of lines) {
    const m = /^seq (\d+) /.exec(l.text);
    if (!m) continue;
    const n = Number(m[1]);
    seen.push(n);
    if (n < prev) inv++;
    prev = Math.max(prev, n);
  }
  return { arrivalOrder: seen, inversions: inv };
}
