import type { ErrorCode } from "@runyard/protocol";
import type { TabRow } from "../../shared/library-state.ts";
import { STARTING_STATES } from "./start-view.ts";

// 预览区在没有页面时显示哪一种画面的纯判断（规格 DESKTOP-WORKSPACE-18 至 22），不碰 DOM、不生成文字。

export type PreviewScreen =
  /** 项目文件夹找不到：不启动，显示说明和重新定位等操作 */
  | "folder-missing"
  /** 页面已就绪：原生预览视图盖在占位区上，占位区什么都不画 */
  | "page"
  /** 缺少运行环境（缺工具、版本过低） */
  | "missing"
  /** 启动没成功：依赖没装上、进程在就绪前退出等 */
  | "start-failed"
  /** 运行中崩溃 */
  | "crashed"
  /** 启动超过 30 秒还没就绪（不算失败） */
  | "slow"
  /** 创建或再次运行后的启动进度：复制、安装、启动、就绪（规格 DESKTOP-CREATE-FLOW-14） */
  | "starting"
  /** 在进行但不在启动阶段（停止中、重载中） */
  | "waiting"
  /** 没在运行（手动停止、从没运行过） */
  | "stopped";

const MISSING_CODES: readonly ErrorCode[] = ["TOOL_MISSING", "TOOL_TOO_OLD"];

export function previewScreenOf(tab: TabRow): PreviewScreen {
  if (tab.missing === true) return "folder-missing";
  if (tab.previewUrl !== null) return "page";
  if (tab.state === "crashed") return "crashed";
  if (tab.failure !== null) {
    return MISSING_CODES.includes(tab.failure.code) ? "missing" : "start-failed";
  }
  if (tab.active) {
    if (tab.slow) return "slow";
    return STARTING_STATES.includes(tab.state) ? "starting" : "waiting";
  }
  return "stopped";
}

export type StartStep = "copy" | "install" | "start" | "ready";

/** 失败停在启动清单的哪一步；与哪一步无关的失败（缺系统组件）没有步骤条 */
export function failedStepOf(code: ErrorCode): StartStep | null {
  if (code === "SETUP_FAILED" || code === "DEPS_OFFLINE") return "install";
  if (code === "RUN_FAILED") return "start";
  return null;
}

/** 缺工具画面要的字段，从错误参数里取（参数是松散的对象，只认字符串） */
export interface MissingToolFields {
  tool: string;
  required: string;
  /** 版本过低时的当前版本；没装是 null */
  found: string | null;
  installCommand: string | null;
  installUrl: string | null;
}

export function missingToolOf(params: Record<string, unknown>): MissingToolFields {
  const text = (key: string): string | null => {
    const value = params[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  return {
    tool: text("tool") ?? "",
    required: text("required") ?? "",
    found: text("found"),
    installCommand: text("installCommand"),
    installUrl: text("installUrl"),
  };
}

/** 官网链接在界面上显示的样子：去掉协议和末尾的斜杠（go.dev/dl） */
export function urlLabel(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/\/$/, "");
}

/** “查看输出”：把焦点移到控制台的输出区（输出一直在页面底部，这里只是带用户过去） */
export function focusConsoleOutput(): void {
  const log = document.querySelector<HTMLElement>("[data-console] [role=log]");
  log?.focus();
}
