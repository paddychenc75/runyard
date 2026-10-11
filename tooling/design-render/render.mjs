#!/usr/bin/env node
import { execFileSync } from "node:child_process";
// 本地渲染器：展开 .dc.html 模板 -> build/*.html -> Chrome 截图 -> 联系表
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(ROOT, "../../docs/design");
const BUILD = path.join(ROOT, "build"),
  PNG = path.join(ROOT, "png"),
  SHEETS = path.join(ROOT, "sheets");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
for (const d of [BUILD, PNG, SHEETS]) fs.mkdirSync(d, { recursive: true });

class DCLogic {
  constructor() {
    this.props = {};
    this.state = {};
  }
  setState() {}
  forceUpdate() {}
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function lookup(expr, scope) {
  let cur = scope;
  for (const k of expr.trim().split(".")) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
const WHOLE = /^\s*\{\{([^{}]*)\}\}\s*$/;
function interp(text, scope, attr) {
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, e) => {
    const v = lookup(e, scope);
    if (v == null || v === false) return "";
    return attr ? escAttr(v) : esc(v);
  });
}

// ---- 模板解析：只识别 sc-for / sc-if / dc-import，其余视为文本 ----
const TAG_RE = /<(\/?)(sc-for|sc-if|dc-import)(?=[\s>/])/g;
function readOpenTag(src, pos) {
  // pos 在 '<' ；返回 {attrs, end, selfClose}
  let i = pos,
    q = null;
  while (i < src.length) {
    const c = src[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ">") break;
    i++;
  }
  const raw = src.slice(pos, i);
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of raw.matchAll(re)) attrs[m[1]] = m[3] ?? m[4];
  return { attrs, end: i + 1 };
}
function parse(src) {
  // -> 节点数组：string | {tag, attrs, children}
  let pos = 0;
  function parseSeq(closeTag) {
    const out = [];
    TAG_RE.lastIndex = pos;
    for (;;) {
      TAG_RE.lastIndex = pos;
      const m = TAG_RE.exec(src);
      if (!m) {
        out.push(src.slice(pos));
        pos = src.length;
        if (closeTag) throw new Error(`unclosed ${closeTag}`);
        return out;
      }
      if (m.index > pos) out.push(src.slice(pos, m.index));
      if (m[1]) {
        // 闭合标签
        const end = src.indexOf(">", m.index) + 1;
        if (m[2] !== closeTag) throw new Error(`mismatched </${m[2]}> expecting ${closeTag}`);
        pos = end;
        return out;
      }
      const { attrs, end } = readOpenTag(src, m.index);
      const selfClosed = /\/\s*>$/.test(src.slice(m.index, end));
      pos = end;
      const node = { tag: m[2], attrs, children: [] };
      if (m[2] === "dc-import") {
        // 可能写成 <dc-import ...></dc-import>
        const rest = /^\s*<\/dc-import>/.exec(src.slice(pos));
        if (rest) pos += rest[0].length;
      } else if (!selfClosed) node.children = parseSeq(m[2]);
      out.push(node);
    }
  }
  return parseSeq(null);
}

const styles = []; // 收集 helmet
const seenHelmet = new Set();

function expandNodes(nodes, scope, ctx) {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") {
      out += interp(n, scope, false);
      continue;
    }
    if (n.tag === "sc-for") {
      const list = lookup((WHOLE.exec(n.attrs.list || "") || [undefined, ""])[1], scope);
      const as = n.attrs.as || "item";
      (Array.isArray(list) ? list : []).forEach((item, i) => {
        out += expandNodes(
          n.children,
          Object.assign(Object.create(scope), { [as]: item, $index: i }),
          ctx,
        );
      });
    } else if (n.tag === "sc-if") {
      const m = WHOLE.exec(n.attrs.value || "");
      const v = m ? lookup(m[1], scope) : n.attrs.value;
      if (v && v !== "false") out += expandNodes(n.children, scope, ctx);
    } else if (n.tag === "dc-import") {
      out += expandFile(n.attrs.name, ctx);
    }
  }
  return out;
}

// 属性里的 {{x}} 是文本插值的一部分，已由 interp 处理；这里只需保证值被转义。
// 但 interp 在文本模式下转义 < &，属性里的引号需要处理：对整段文本中位于标签内的值统一使用 attr 转义不易区分，
// 因此值里若含引号会少见；为稳妥，文本模式下额外转义双引号仅在属性位置——用下面的 fixup 处理。
function expandFile(name, ctx) {
  const file = path.join(SRC, `${name}.dc.html`);
  const html = fs.readFileSync(file, "utf8");
  const a = html.indexOf("<x-dc>"),
    b = html.indexOf("</x-dc>");
  let body = html.slice(a + 6, b);
  const h = /<helmet>([\s\S]*?)<\/helmet>/.exec(body);
  if (h) {
    body = body.replace(h[0], "");
    if (!seenHelmet.has(name)) {
      seenHelmet.add(name);
      styles.push(h[1]);
    }
  }
  const sm =
    /<script type="text\/x-dc"[^>]*?(?:data-props='([^']*)')?[^>]*>([\s\S]*?)<\/script>/.exec(
      html.slice(b),
    );
  let data = {},
    props = {};
  if (sm) {
    try {
      const dp = sm[1] ? JSON.parse(sm[1]) : {};
      for (const [k, v] of Object.entries(dp))
        if (v && typeof v === "object" && "default" in v) props[k] = v.default;
    } catch {}
    const Comp = new Function("DCLogic", `${sm[2]}\n;return Component;`)(DCLogic);
    const inst = new Comp();
    inst.props = props;
    inst.state = {};
    data = inst.renderVals() || {};
  }
  return expandNodes(parse(body), data, ctx);
}

function buildBoard(name) {
  styles.length = 0;
  seenHelmet.clear();
  const html0 = fs.readFileSync(path.join(SRC, `${name}.dc.html`), "utf8");
  const title = (/<title>([^<]*)<\/title>/.exec(html0) || [undefined, name])[1];
  const lang = (/<html[^>]*lang="([^"]*)"/.exec(html0) || [undefined, "zh-CN"])[1];
  let body = expandFile(name, {});
  // 运行时的 /_blob/<hash> 图片本地没有；按板名猜测对应 design/logo/sheet-*.png（近似）
  const lm = /^Logo(Type|Brand|Craft)/.exec(name);
  if (lm)
    body = body.replace(
      /\/_blob\/[0-9a-f]+/g,
      `file://${path.join(SRC, "logo", `sheet-${lm[1].toLowerCase()}.png`)}`,
    );
  return `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n${styles.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

// ---- main ----
const canvas = JSON.parse(fs.readFileSync(path.join(SRC, "canvas.json"), "utf8"));
const stem = (f) => f.replace(/\.dc\.html$/, "");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skipShots = process.argv.includes("--no-shots");
const files = canvas.order.filter((f) => canvas.boards[f]);
for (const o of only) if (!files.includes(`${o}.dc.html`)) files.push(`${o}.dc.html`); // 不在 canvas.json 里的板子也渲染
let ok = 0,
  fail = [];
for (const f of files) {
  const s = stem(f);
  if (only.length && !only.includes(s)) continue;
  const { w, h } = canvas.boards[f] || { w: 1440, h: 900 }; // 找不到尺寸时按 1440x900
  try {
    fs.writeFileSync(path.join(BUILD, `${s}.html`), buildBoard(s));
    if (!skipShots) {
      const out = path.join(PNG, `${s}.png`);
      // 多留一点高度，之后按 2w x 2h 裁掉
      execFileSync(
        CHROME,
        [
          "--headless",
          "--disable-gpu",
          "--hide-scrollbars",
          "--force-device-scale-factor=2",
          `--window-size=${w},${h}`,
          `--screenshot=${out}`,
          `file://${path.join(BUILD, `${s}.html`)}`,
        ],
        { stdio: "ignore", timeout: 60000 },
      );
      cropTo(out, w * 2, h * 2);
    }
    ok++;
  } catch (e) {
    fail.push(`${s}: ${e.message}`);
  }
}
console.log(`rendered ${ok}/${files.length}`, fail.length ? fail : "");

function cropTo(png, W, H) {
  // 用 macOS sips 裁剪（不依赖第三方包）
  const dim = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", png]).toString();
  const pw = +/pixelWidth: (\d+)/.exec(dim)[1],
    ph = +/pixelHeight: (\d+)/.exec(dim)[1];
  if (pw === W && ph === H) return;
  if (pw < W || ph < H) throw new Error(`png too small ${pw}x${ph} < ${W}x${H}`);
  execFileSync(
    "sips",
    ["--cropToHeightWidth", String(H), String(W), "--cropOffset", "0", "0", png],
    { stdio: "ignore" },
  );
}

// ---- 联系表：生成 HTML，用 Chrome 截图 ----
if (!only.length && !skipShots) {
  const TW = 720;
  for (const pg of canvas.pages) {
    const items = files.filter((f) => canvas.boards[f].page === pg.id);
    const cells = items
      .map((f) => {
        const b = canvas.boards[f],
          th = Math.round((TW * b.h) / b.w);
        return `<figure><img src="file://${PNG}/${stem(f)}.png" width="${TW}" height="${th}"><figcaption>${esc(b.title)} <small>${stem(f)}</small></figcaption></figure>`;
      })
      .join("");
    const _maxH = Math.max(
      ...items.map((f) => Math.round((TW * canvas.boards[f].h) / canvas.boards[f].w)),
    );
    const cols = 3,
      rowsH = [];
    for (let i = 0; i < items.length; i += cols)
      rowsH.push(
        Math.max(
          ...items
            .slice(i, i + cols)
            .map((f) => Math.round((TW * canvas.boards[f].h) / canvas.boards[f].w)),
        ) + 56,
      );
    const Wd = cols * (TW + 24) + 24,
      Hd = rowsH.reduce((a, b) => a + b + 24, 0) + 64;
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e8e8ec;font:16px -apple-system,'PingFang SC',sans-serif}h1{margin:0;padding:16px 24px;height:32px;font-size:22px}
.g{display:grid;grid-template-columns:repeat(${cols},${TW}px);gap:24px;padding:0 24px;align-items:start}figure{margin:0}img{display:block;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.25)}figcaption{margin-top:8px;font-size:18px;height:48px;color:#222}small{color:#888;font-size:13px;margin-left:6px}</style>
<h1>${esc(pg.name)}</h1><div class="g">${cells}</div>`;
    const hf = path.join(BUILD, `_sheet_${pg.id}.html`);
    fs.writeFileSync(hf, html);
    const out = path.join(SHEETS, `${pg.id}.png`);
    execFileSync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${Wd},${Hd + 200}`,
        `--screenshot=${out}`,
        `file://${hf}`,
      ],
      { stdio: "ignore", timeout: 120000 },
    );
    execFileSync(
      "sips",
      ["--cropToHeightWidth", String(Hd), String(Wd), "--cropOffset", "0", "0", out],
      { stdio: "ignore" },
    );
    console.log("sheet", pg.id, items.length);
  }
}
