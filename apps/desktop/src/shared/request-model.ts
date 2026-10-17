import type { RequestHeader, RequestMethod, RequestResult, RequestSpec } from "@runyard/protocol";
import type { TabRow } from "./library-state.ts";

// 请求面板里不碰 DOM 的几件事（规格 desktop/request-panel）：请求头的文字写法、复制为 curl、
// 响应体的格式化、发送按钮能不能点、什么时候自动重发。

/** 面板里填的内容；请求头是文本框里的原文，发送时才解析 */
export interface RequestDraft {
  method: RequestMethod;
  path: string;
  headers: string;
  payload: string;
}

export const DEFAULT_DRAFT: RequestDraft = { method: "GET", path: "/", headers: "", payload: "" };

/** 文本框 → 请求头：每行 `名字: 值`，空行和没有冒号的行忽略；同名的头按出现顺序都保留 */
export function parseHeaders(text: string): RequestHeader[] {
  const headers: RequestHeader[] = [];
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim();
    if (name === "") continue;
    headers.push({ name, value: line.slice(colon + 1).trim() });
  }
  return headers;
}

export function headersToText(headers: readonly RequestHeader[]): string {
  return headers.map(({ name, value }) => `${name}: ${value}`).join("\n");
}

/** 路径框里写的内容 → 协议要的路径：必须以 / 开头，没写就补上；这里不碰主机（主机永远是项目自己的） */
export function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function draftToSpec(draft: RequestDraft): RequestSpec {
  return {
    method: draft.method,
    path: normalizePath(draft.path),
    headers: parseHeaders(draft.headers),
    // GET 不带请求体
    payload: draft.method === "GET" ? "" : draft.payload,
  };
}

export function specToDraft(spec: RequestSpec): RequestDraft {
  return {
    method: spec.method,
    path: spec.path,
    headers: headersToText(spec.headers),
    payload: spec.payload,
  };
}

// 单引号包起来，里面的单引号写成 '\''：shell 对单引号里的内容不做任何展开
const quote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * 复制为 curl（规格 DESKTOP-REQUEST-PANEL-11）：能直接在终端运行，服务收到同样的方法、路径、头和请求体。
 * `--globoff` 让路径里的 [ ] { } 不被 curl 当通配；有请求体而用户没写 content-type 时，
 * curl 会自己补一个 x-www-form-urlencoded，所以用 `-H 'Content-Type:'` 去掉它，和应用发出的请求一致
 */
export function buildCurl(spec: RequestSpec, port: number): string {
  const parts = ["curl", "--globoff"];
  if (spec.method !== "GET") parts.push("-X", spec.method);
  for (const { name, value } of spec.headers) parts.push("-H", quote(`${name}: ${value}`));
  const hasBody = spec.method !== "GET" && spec.payload !== "";
  if (hasBody) {
    if (!spec.headers.some((header) => header.name.toLowerCase() === "content-type")) {
      parts.push("-H", quote("Content-Type:"));
    }
    parts.push("--data-raw", quote(spec.payload));
  }
  parts.push(quote(`http://127.0.0.1:${port}${spec.path}`));
  return parts.join(" ");
}

/** 响应体是 JSON 就按两格缩进整理，其余原样（规格 DESKTOP-REQUEST-PANEL-03） */
export function formatBody(payload: string): { text: string; json: boolean } {
  const trimmed = payload.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), json: true };
    } catch {
      // 不是合法的 JSON：原样显示
    }
  }
  return { text: payload, json: false };
}

/** 状态码的颜色档：2xx 成功色，3xx 中性，4xx 警示，5xx 危险 */
export function statusTone(status: number): "success" | "neutral" | "warning" | "danger" {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 300) return "neutral";
  return "success";
}

/** 发送按钮不可点时的说明；可以发送是 null（规格 DESKTOP-REQUEST-PANEL-06） */
export function notReadyReason(tab: Pick<TabRow, "state">): "starting" | "stopped" | null {
  switch (tab.state) {
    case "ready":
      return null;
    case "checking":
    case "installing":
    case "starting":
    case "reloading":
      return "starting";
    default:
      return "stopped";
  }
}

/** 服务因为文件变化重启、重新就绪：从 reloading 回到 ready（规格 DESKTOP-REQUEST-PANEL-09） */
export function reloadedAgain(previous: TabRow["state"], next: TabRow["state"]): boolean {
  return previous === "reloading" && next === "ready";
}
