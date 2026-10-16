// 伪语言 en-XA（技术设计 §6.8“伪语言规则”）：从英文文案变出来的假语言，用来在开发和测试里
// 查两件事：版面溢出（长度加约 40%），和漏网文字（真文字都在一对 ⟦ ⟧ 里，没包的就是没走文案包）。
// 只在开发版和测试里可选，设置页的语言列表（locale.ts 的 locales）里没有它，用户看不到。
// 为什么自己扫 ICU 而不用解析器：解析器只许在 build/ 里导入（运行时只有 intl-messageformat），
// 而这里只需要分清“文字”和“参数、标签”，一个小的递归扫描就够。

export const pseudoLocale = "en-XA";
export type PseudoLocale = typeof pseudoLocale;

export const PSEUDO_OPEN = "⟦";
export const PSEUDO_CLOSE = "⟧";
// 末尾补的字符数占字母数的比例
const GROWTH = 0.4;
const PAD = "~";

const ACCENTED: Readonly<Record<string, string>> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ó",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ú",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Á",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ó",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Ú",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

const TAG = /^<\/?[A-Za-z][\w-]*\s*\/?>/;
const BRANCH_TYPES = new Set(["plural", "select", "selectordinal"]);

interface Cursor {
  src: string;
  pos: number;
  letters: number;
}

// 文字部分：变成带重音的字母；参数 {…}、标签 <b>、引号包起来的 '{' 原样保留
function text(cursor: Cursor, inBranch: boolean): string {
  let out = "";
  const { src } = cursor;
  while (cursor.pos < src.length) {
    const ch = src[cursor.pos] as string;
    if (ch === "}" && inBranch) return out;
    if (ch === "{") {
      out += argument(cursor);
    } else if (ch === "'" && "{}<".includes(src[cursor.pos + 1] ?? "")) {
      // ICU 的引号转义：'{' 到下一个 ' 之间是字面量
      const end = src.indexOf("'", cursor.pos + 1);
      const stop = end === -1 ? src.length : end + 1;
      out += src.slice(cursor.pos, stop);
      cursor.pos = stop;
    } else if (ch === "<" && TAG.test(src.slice(cursor.pos))) {
      const tag = (TAG.exec(src.slice(cursor.pos)) as RegExpExecArray)[0];
      out += tag;
      cursor.pos += tag.length;
    } else {
      const accented = ACCENTED[ch];
      if (accented !== undefined) cursor.letters += 1;
      out += accented ?? ch;
      cursor.pos += 1;
    }
  }
  return out;
}

// 读到下一个 stop 字符之前原样复制
function copyUntil(cursor: Cursor, stop: string): string {
  const start = cursor.pos;
  while (cursor.pos < cursor.src.length && !stop.includes(cursor.src[cursor.pos] as string)) {
    cursor.pos += 1;
  }
  return cursor.src.slice(start, cursor.pos);
}

// {name}、{name, number}、{name, plural, one {…} other {…}}：名字和类型原样，分支里的文字才变
function argument(cursor: Cursor): string {
  let out = "{";
  cursor.pos += 1;
  out += copyUntil(cursor, ",}");
  if (cursor.src[cursor.pos] === ",") {
    out += ",";
    cursor.pos += 1;
    const typeText = copyUntil(cursor, ",}");
    out += typeText;
    if (cursor.src[cursor.pos] === "," && BRANCH_TYPES.has(typeText.trim())) {
      out += ",";
      cursor.pos += 1;
      out += branches(cursor);
    } else {
      out += copyUntil(cursor, "}");
    }
  }
  if (cursor.src[cursor.pos] === "}") {
    out += "}";
    cursor.pos += 1;
  }
  return out;
}

// 分支列表：选择词（one、other、=0、offset:1）原样，大括号里是文字
function branches(cursor: Cursor): string {
  let out = "";
  while (cursor.pos < cursor.src.length && cursor.src[cursor.pos] !== "}") {
    if (cursor.src[cursor.pos] === "{") {
      out += "{";
      cursor.pos += 1;
      out += text(cursor, true);
      if (cursor.src[cursor.pos] === "}") {
        out += "}";
        cursor.pos += 1;
      }
    } else {
      out += copyUntil(cursor, "{}");
    }
  }
  return out;
}

/** 把一条 ICU 英文文案变成伪语言文案：字母加重音，末尾补约 40% 的长度，首尾加 ⟦ ⟧ */
export function pseudolocalize(message: string): string {
  const cursor: Cursor = { src: message, pos: 0, letters: 0 };
  const body = text(cursor, false);
  const pad = PAD.repeat(Math.ceil(cursor.letters * GROWTH));
  return `${PSEUDO_OPEN}${body}${pad}${PSEUDO_CLOSE}`;
}
