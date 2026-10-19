import type { FileTarget } from "./editor-files.ts";

export interface VuePosition {
  line: number;
  character: number;
}
export type VueRequestKind =
  | "completion"
  | "completionDetails"
  | "hover"
  | "definition"
  | "diagnostics";
export interface VueRequest extends FileTarget {
  requestId: string;
  kind: VueRequestKind;
  position?: VuePosition;
  /** 只接受主进程上一次补全返回的不透明标识，不接受任意服务器参数。 */
  detailId?: string;
}
export interface VueDocument extends FileTarget {
  session: string;
  text: string;
  version: number;
}
export type VueResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "unavailable" | "invalid" | "cancelled" };
export interface VueDiagnostics extends FileTarget {
  session: string;
  version: number;
  vue: unknown[];
  syntax: unknown[];
  semantic: unknown[];
}
export interface VueMethods {
  "vue.open": { param: VueDocument; result: VueResult };
  "vue.sync": { param: VueDocument; result: VueResult };
  "vue.close": { param: FileTarget & { version: number; session: string }; result: undefined };
  "vue.request": { param: VueRequest; result: VueResult };
  "vue.cancel": { param: { project: string; requestId: string }; result: undefined };
}
export interface VueEvents {
  "vue.diagnostics": VueDiagnostics;
  "vue.status": { project: string; state: "ready" | "restarting" | "disabled" | "closed" };
}
export const vueMethodNames: readonly (keyof VueMethods)[] = [
  "vue.open",
  "vue.sync",
  "vue.close",
  "vue.request",
  "vue.cancel",
];
export const vueEventNames: readonly (keyof VueEvents)[] = ["vue.diagnostics", "vue.status"];
