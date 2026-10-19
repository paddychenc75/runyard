// 页面自动刷新：给 HTML 响应注入一小段脚本，订阅管理进程的 SSE，收到事件就刷新。
// 事件地址是保留的，项目自己不能占用这个路径。

export const RELOAD_EVENTS_PATH = "/__runyard/reload";

const RELOAD_SNIPPET = `<script>new EventSource(${JSON.stringify(RELOAD_EVENTS_PATH)}).onmessage=function(){location.reload()}</script>`;

/** 插在最后一个 `</body>` 之前；没有就接在末尾（浏览器容错，仍然执行） */
export function injectReloadScript(html: string): string {
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at === -1 ? html + RELOAD_SNIPPET : html.slice(0, at) + RELOAD_SNIPPET + html.slice(at);
}
