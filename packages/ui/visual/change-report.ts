// “界面变更对照页”（技术设计 §6.7）：截图比对失败时产出的一个自包含 HTML 文件，给负责人看。
// 每个变了的组件一行：左边改动前（基准图）、中间差异、右边改动后；标题是组件名加主题和语言的中文说法。
// 图片直接嵌进文件（data URI），下载一个文件就能看，不依赖 CI 产物里的其他路径。

export interface ChangeEntry {
  component: string;
  /** 例如“浅色、中文” */
  combination: string;
  /** 三张图的 data URI；没有基准图（新组件）时 before 为空 */
  before?: string;
  diff?: string;
  after?: string;
  /** 不是图片差异的失败（溢出、漏网文字、字体）：错误信息原文 */
  problem?: string;
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const picture = (title: string, src: string | undefined): string =>
  src === undefined
    ? `<figure><figcaption>${title}</figcaption><p class="none">没有</p></figure>`
    : `<figure><figcaption>${title}</figcaption><img alt="${title}" src="${src}"></figure>`;

function row(entry: ChangeEntry): string {
  const title = `${escapeHtml(entry.component)}（${escapeHtml(entry.combination)}）`;
  if (entry.problem !== undefined) {
    return `<section><h2>${title}</h2><pre>${escapeHtml(entry.problem)}</pre></section>`;
  }
  return `<section><h2>${title}</h2><div class="trio">${picture("改动前", entry.before)}${picture("差异", entry.diff)}${picture("改动后", entry.after)}</div></section>`;
}

const STYLE = `
body{font:15px/1.5 -apple-system,"PingFang SC",sans-serif;margin:24px;background:#f5f5f7;color:#1d1d1f}
h1{font-size:22px}h2{font-size:17px;margin:0 0 8px}
section{background:#fff;border-radius:12px;padding:16px;margin:16px 0}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
figure{margin:0;min-width:0}figcaption{color:#6e6e73;margin-bottom:4px}
img{max-width:100%;border:1px solid #d2d2d7}
.none{color:#86868b}pre{white-space:pre-wrap;margin:0}
`;

export function buildChangeReport(entries: readonly ChangeEntry[]): string {
  const body =
    entries.length === 0 ? "<p>没有界面变化。</p>" : entries.map((entry) => row(entry)).join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>界面变更对照页</title><style>${STYLE}</style></head>
<body><h1>界面变更对照页</h1><p>共 ${entries.length} 处：左边是基准图（改动前），右边是这次的截图（改动后），中间标出差异。确认变化是有意的之后，给 PR 加标签 update-ui-baseline，由 CI 重新生成基准图。</p>
${body}</body></html>
`;
}
