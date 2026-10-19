#!/usr/bin/env node
// 图标交付证据：静态 SVG/CSS 样片；真实 React 组件由 ui-visual 另行验证。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = process.env.RUNYARD_ICON_REVIEW_OUTPUT
  ? path.resolve(process.env.RUNYARD_ICON_REVIEW_OUTPUT)
  : mkdtempSync(path.join(tmpdir(), "runyard-icon-review-"));
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(path.join(tmpdir(), "runyard-icon-render-"));
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const head = git("rev-parse", "HEAD");
const base = git(
  "rev-parse",
  process.env.RUNYARD_ICON_REVIEW_BASE || git("merge-base", "HEAD", "origin/main"),
);
const read = (file, before = false) =>
  before ? git("show", `${base}:${file}`) : readFileSync(path.join(repo, file), "utf8");
const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const chrome =
  process.env.RUNYARD_ICON_REVIEW_CHROME ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find(existsSync);
if (!chrome) throw new Error("没有找到 Chrome；请用 RUNYARD_ICON_REVIEW_CHROME 指定可执行文件。");

// 复用现有展开器，不修改设计源；临时副本只把设计输入指回仓库，产物留在临时目录。
const renderer = read("tooling/design-render/render.mjs").replace(
  'const SRC = path.resolve(ROOT, "../../docs/design");',
  `const SRC = ${JSON.stringify(path.join(repo, "docs/design"))};`,
);
const rendererFile = path.join(temporary, "render.mjs");
writeFileSync(rendererFile, renderer);
execFileSync(process.execPath, [rendererFile, "SpecType", "SpecTypeEn", "--no-shots"], {
  cwd: repo,
  stdio: "pipe",
});

const sourceFiles = [
  "packages/tokens/generated/tokens.css",
  "packages/ui/src/styles/reset.css",
  "packages/ui/src/styles/base.css",
  "packages/ui/src/primitives/Icon/Icon.module.css",
  "packages/ui/src/primitives/IconButton/IconButton.module.css",
];
function copiedStyles(before) {
  return sourceFiles
    .map((file) => {
      const css = read(file, before);
      if (file.endsWith("/Icon.module.css")) return css.replaceAll(".root", ".icon");
      if (file.endsWith("/IconButton.module.css")) return css.replaceAll(".root", ".icon-button");
      return css;
    })
    .join("\n");
}
const names = ["refresh", "stop", "more"];
const svgFiles = names.map((name) => `packages/ui/src/icons/svg/${name}.svg`);
const difference = git("diff", base, "--", ...svgFiles, ...sourceFiles);
function icon(name, size, before) {
  const source = read(`packages/ui/src/icons/svg/${name}.svg`, before);
  return source.replace(
    "<svg ",
    `<svg class="icon" data-icon="${name}" width="${size}" height="${size}" `,
  );
}
function sample(before, locale) {
  const labels = locale === "zh-CN" ? ["重启", "停止", "更多"] : ["Restart", "Stop", "More"];
  const states = locale === "zh-CN" ? ["静止", "悬停", "禁用"] : ["Normal", "Hover", "Disabled"];
  const rows = states
    .map(
      (label, index) =>
        `<div class="row"><span>${label}</span>${names
          .map(
            (name, i) =>
              `<button class="icon-button" data-size="sm" data-variant="ghost" aria-label="${labels[i]}" ${index === 1 ? 'data-force-state="hover"' : ""} ${index === 2 ? "disabled" : ""}>${icon(name, 14, before)}</button>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const sizes = [14, 16, 20, 24]
    .map(
      (size) =>
        `<div class="row"><span>${size}</span>${names.map((name) => icon(name, size, before)).join("")}</div>`,
    )
    .join("");
  return `${rows}<hr>${sizes}`;
}
function designSection(locale) {
  const board = locale === "zh-CN" ? "SpecType" : "SpecTypeEn";
  const html = readFileSync(path.join(temporary, "build", `${board}.html`), "utf8");
  const section = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)]
    .map((match) => match[0])
    .find((value) => /图标：16 px|Icons: 16 px/.test(value));
  if (!section) throw new Error(`${board} 没有找到图标规范；请检查设计展开器与画板结构。`);
  return section;
}
function sampleDocument(before, theme, locale) {
  return `<!doctype html><html lang="${locale}" data-theme="${theme}"><meta charset="utf-8"><style>
${copiedStyles(before)}
body{padding:24px}.row{display:flex;align-items:center;gap:12px;min-height:32px;margin-bottom:12px}.row>span{width:76px}hr{border:0;border-top:1px solid var(--color-text-secondary);opacity:.2;margin:20px 0}
</style>${sample(before, locale)}</html>`;
}
function screenshot(html, png, width, height) {
  execFileSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      `--user-data-dir=${path.join(temporary, "chrome-profile")}`,
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${png}`,
      pathToFileURL(html).href,
    ],
    { stdio: "pipe", timeout: 60000 },
  );
  if (!existsSync(png)) throw new Error(`Chrome 没有生成截图：${png}。`);
}

for (const width of [1440, 1100]) {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["zh-CN", "en"]) {
      const name = `${width}-${theme}-${locale}`;
      for (const before of [true, false]) {
        writeFileSync(
          path.join(output, `${name}-${before ? "before" : "after"}.html`),
          sampleDocument(before, theme, locale),
        );
      }
      const title = `图标对照 · ${width} · ${theme} · ${locale}`;
      const paths = [true, false]
        .map((before) => escapeHtml(read(svgFiles[1], before)))
        .map((svg, i) => `<p>${i === 0 ? "基线" : "当前"}停止图标：</p><pre>${svg}</pre>`)
        .join("");
      const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><style>
body{margin:0;background:#eee;color:#222;font:14px -apple-system,sans-serif}header{padding:16px 24px}h1{font-size:18px;margin:0 0 6px}p{margin:8px 0}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:0 24px 24px}h2{font-size:15px;margin:8px 0}iframe{width:100%;height:430px;border:0}.design{background:#fff;padding:12px}.design section{font-family:-apple-system,sans-serif}.details{padding:12px}code,pre{overflow-wrap:anywhere;white-space:pre-wrap;font-size:11px}
</style><header><h1>${title}</h1><p>静态 SVG/CSS 样片：复用对应版本的图标源、Icon / IconButton 样式与设计变量。真实 React 组件由 ui-visual 验证。</p></header><div class="grid"><div><h2>修改前 · 基线</h2><iframe src="${name}-before.html"></iframe></div><div><h2>修改后 · 当前工作树</h2><iframe src="${name}-after.html"></iframe></div><div class="design"><h2>官方图标规范 · ${locale === "en" ? "SpecTypeEn" : "SpecType"}</h2>${designSection(locale)}</div><div class="details"><h2>与设计稿的差异</h2><p>设计稿停止为圆角空心方框。对照上方基线、当前样片与下方源路径判断占比和轮廓；完整源码差异见 README。</p><p>SpecType 是浅色图标规范，深色样片使用对应版本的深色变量。纯图标按钮点击区 28，SVG 14；另展示独立图标 14 / 16 / 20 / 24。</p>${paths}<p>基线：<code>${escapeHtml(base)}</code></p><p>当前：<code>${escapeHtml(head)}</code></p></div></div></html>`;
      const file = path.join(output, `${name}.html`);
      writeFileSync(file, html);
      screenshot(file, path.join(output, `${name}.png`), width, 1180);
    }
  }
}
const hashes = sourceFiles
  .map((file) => `- ${file}：${createHash("sha256").update(read(file)).digest("hex")}`)
  .join("\n");
writeFileSync(
  path.join(output, "README.md"),
  `# 图标设计对照证据

基线提交：${base}
当前提交：${head}（样片读取当前工作树，未提交修改也会体现）

八组 PNG：浅色 / 深色 × 中文 / 英文 × 1440 / 1100。打开同名 HTML 可检查原始样片。
这是静态 SVG/CSS 样片，使用真实 SVG 源、Icon / IconButton CSS、设计变量与展开后的 SpecType 图标规范；真实 React 组件另由 ui-visual 验证。没有修改截图基准图。

设计差异：SpecType 的停止轮廓为圆角空心方框；当前与基线的具体路径附在每张图里。纯图标按钮 28 / SVG 14；另展示 14、16、20、24 图标。

## 基线到当前工作树的源码差异

\`\`\`diff
${difference || "没有图标或样式源码差异。"}
\`\`\`

## 当前样式输入 SHA-256

${hashes}

## 复现

Node 24：运行 node tooling/design-render/icon-review.mjs。
RUNYARD_ICON_REVIEW_BASE 可指定基线提交；RUNYARD_ICON_REVIEW_OUTPUT 可指定产物目录；RUNYARD_ICON_REVIEW_CHROME 可指定 Chrome 可执行文件。默认目录由 mkdtemp 创建，浏览器配置单独放在临时目录。
`,
);
console.log(`已生成八组图标对照证据：${output}`);
