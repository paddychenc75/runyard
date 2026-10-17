// 模糊匹配（规格 DESKTOP-EDITOR-58、69）：查询里的字符按顺序出现在文本里就算匹配，不分大小写，
// 返回命中的位置（用来高亮）和一个分数（越大越好）。
// 打分只看三件事：连续命中、落在词首（开头、分隔符或驼峰大写之后）、靠前；够用，不追求别的编辑器那种精细度。

export interface FuzzyMatch {
  score: number;
  /** 命中字符在文本里的下标，升序 */
  positions: number[];
}

const SEPARATORS = new Set([" ", "/", "\\", "-", "_", ".", ":", ">"]);

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const before = text[index - 1] ?? "";
  if (SEPARATORS.has(before)) return true;
  const here = text[index] ?? "";
  return before === before.toLowerCase() && here !== here.toLowerCase();
}

/** 从 from 开始向后找第一个满足顺序的命中；找不到是 null */
function matchFrom(query: string, text: string, from: number): FuzzyMatch | null {
  const lowerText = text.toLowerCase();
  const positions: number[] = [];
  let cursor = from;
  for (const ch of query) {
    const at = lowerText.indexOf(ch, cursor);
    if (at === -1) return null;
    positions.push(at);
    cursor = at + 1;
  }
  let score = 0;
  positions.forEach((at, i) => {
    if (isWordStart(text, at)) score += 8;
    const previous = positions[i - 1];
    if (previous !== undefined && at === previous + 1) score += 6;
    // 命中之间隔得越远越不像是想找的那个（封顶，免得一个远处的字母把别的优点全抵消）
    else if (previous !== undefined) score -= Math.min(at - previous - 1, 12) * 0.5;
    score += Math.max(0, 4 - at / 8);
  });
  return { score, positions };
}

/**
 * 在 text 里匹配 query。空查询匹配一切（分数 0，没有高亮）。
 * 贪心找到第一组命中后，再试着从每个词首重新开始，取分数最高的那一组：
 * 这样 "app" 会命中 "App.tsx" 开头的三个字母，而不是散在路径里。
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const wanted = [...query.trim().toLowerCase()].filter((ch) => ch !== " ").join("");
  if (wanted === "") return { score: 0, positions: [] };
  const first = matchFrom(wanted, text, 0);
  if (first === null) return null;
  let best = first;
  const lowerText = text.toLowerCase();
  for (let start = 1; start < text.length; start += 1) {
    if (lowerText[start] !== wanted[0] || !isWordStart(text, start)) continue;
    const candidate = matchFrom(wanted, text, start);
    if (candidate !== null && candidate.score > best.score) best = candidate;
  }
  return best;
}

/** 把文本按命中位置切成片段，给界面高亮用；offset 是这段文本在原字符串里的起点 */
export function highlightParts(
  text: string,
  positions: readonly number[],
  offset = 0,
): { text: string; hit: boolean; start: number }[] {
  const hits = new Set(positions.map((at) => at - offset));
  const parts: { text: string; hit: boolean; start: number }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const hit = hits.has(i);
    const last = parts.at(-1);
    if (last !== undefined && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i] ?? "", hit, start: i });
  }
  return parts;
}
