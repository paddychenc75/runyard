import type { VueStatusState } from "../../bridge/vue-language.ts";

// “格式化文档”能不能用（规格 DESKTOP-EDITOR-95 至 99）：菜单、命令面板、编辑器三处共用这一个判断。
// 已有语言服务能处理的文件才能格式化：TS/JS/CSS/HTML/JSON 用 Monaco 自带的，Vue 走官方语言服务；
// Python、Go 第一版没有格式化器（ADR 0021 之外不新增依赖），其余文件类型同理。

export type FormatBlock = "python" | "go" | "other" | "vue";
export type FormatSupport = { ok: true } | { ok: false; block: FormatBlock };

const BUILT_IN = new Set(["typescript", "javascript", "css", "html", "json"]);

/** Vue 语言服务重启中或已放弃（连续失败）时不可用；还没起过（惰性启动）和已关闭的按可用算，请求时会按需拉起 */
export function vueServiceUsable(state: VueStatusState | null): boolean {
  return state !== "disabled" && state !== "restarting";
}

export function formatSupport(languageId: string, vueUsable: boolean): FormatSupport {
  if (BUILT_IN.has(languageId)) return { ok: true };
  if (languageId === "vue") return vueUsable ? { ok: true } : { ok: false, block: "vue" };
  if (languageId === "python") return { ok: false, block: "python" };
  if (languageId === "go") return { ok: false, block: "go" };
  return { ok: false, block: "other" };
}

/** 菜单里不可用项的文字，按原因各一条（走文案包，由界面传给编辑器宿主） */
export type FormatMenuLabels = Record<FormatBlock, string>;
