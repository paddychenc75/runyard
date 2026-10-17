import type { RequestResult, RequestSpec } from "@runyard/protocol";

// 请求面板对界面暴露的方法（规格 desktop/request-panel）。请求本身由主进程转给管理进程发，
// 界面不碰网络：目标永远是这个项目自己运行的 127.0.0.1:<端口>，界面只给路径。

export interface RequestMethods {
  /** 发一个请求并等结果；服务没就绪、连不上、超时都是结果里的 failed */
  "request.send": { param: { id: string; request: RequestSpec }; result: RequestResult };
  /** 这个项目上一次发出的请求（规格 DESKTOP-REQUEST-PANEL-08）；没发过是 null */
  "request.getLast": { param: string; result: RequestSpec | null };
  /** “服务重载后自动重发”开关，按项目记住（规格 DESKTOP-REQUEST-PANEL-15） */
  "request.setAutoResend": { param: { id: string; enabled: boolean }; result: undefined };
  /** “在浏览器中打开”（规格 DESKTOP-REQUEST-PANEL-12）：主进程按运行的端口拼地址，请系统默认浏览器打开 */
  "request.openInBrowser": { param: { id: string; path: string }; result: undefined };
}
export type RequestMethod = keyof RequestMethods;

export const requestMethodNames: readonly RequestMethod[] = [
  "request.send",
  "request.getLast",
  "request.openInBrowser",
  "request.setAutoResend",
];
