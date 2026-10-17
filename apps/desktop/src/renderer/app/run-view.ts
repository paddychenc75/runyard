import type { RunState } from "@runyard/protocol";
import type { StatusMarkStatus } from "@runyard/ui";
import type { TabRow } from "../../shared/library-state.ts";
import { statusMarkOf } from "../library-view.ts";

// 标签页运行条和脚本输出头部显示什么的纯判断，不碰 DOM、不生成文字（文字在组件里经文案包）。

/** 脚本（一次性运行）没有预览，显示输出和“已结束” */
export function isScript(tab: TabRow): boolean {
  return tab.kind === "oneshot";
}

export type RunStatusText =
  /** 只有状态名：已停止、启动中…… */
  | { kind: "plain"; state: RunState | "idle" }
  /** 启动超过 30 秒仍未就绪：不是失败，只标“较慢” */
  | { kind: "slow" }
  /** 缺少运行环境：缺哪个工具，或版本过低 */
  | { kind: "tool-missing"; tool: string }
  | { kind: "tool-too-old"; tool: string }
  /** 服务就绪：状态名加端口 */
  | { kind: "port"; state: RunState; port: number }
  /** 脚本运行中：状态名加已运行的时长 */
  | { kind: "script-running"; state: RunState; elapsedMs: number }
  /** 脚本结束：状态名、退出码（被信号结束时没有）、耗时 */
  | { kind: "script-ended"; state: RunState; exitCode: number | null; durationMs: number };

export interface RunStatus {
  mark: StatusMarkStatus;
  text: RunStatusText;
  /** 失败的结果用警示色 */
  danger: boolean;
}

const FAILED: readonly RunState[] = ["errored", "crashed", "failed"];

export function runStatusOf(tab: TabRow, now: number): RunStatus {
  const { state } = tab;
  const mark = statusMarkOf(state);
  const danger = state !== "idle" && FAILED.includes(state);
  if (state === "idle") return { mark, danger, text: { kind: "plain", state } };
  if (isScript(tab)) {
    if (tab.active && tab.startedAt !== null) {
      return {
        mark,
        danger,
        text: { kind: "script-running", state, elapsedMs: Math.max(0, now - tab.startedAt) },
      };
    }
    // 没能启动（failed）没有退出码，只写状态名；停止的也只写状态名
    if (!tab.active && tab.durationMs !== null && (state === "finished" || state === "errored")) {
      return {
        mark,
        danger,
        text: { kind: "script-ended", state, exitCode: tab.exitCode, durationMs: tab.durationMs },
      };
    }
  }
  const missing = missingToolStatus(tab);
  if (missing !== null) return { mark, danger: true, text: missing };
  if (tab.slow) return { mark, danger, text: { kind: "slow" } };
  if ((state === "ready" || state === "running") && tab.port !== null) {
    return { mark, danger, text: { kind: "port", state, port: tab.port } };
  }
  return { mark, danger, text: { kind: "plain", state } };
}

function missingToolStatus(tab: TabRow): RunStatusText | null {
  const failure = tab.failure;
  if (failure === null) return null;
  const tool = typeof failure.params.tool === "string" ? failure.params.tool : "";
  if (failure.code === "TOOL_MISSING") return { kind: "tool-missing", tool };
  if (failure.code === "TOOL_TOO_OLD") return { kind: "tool-too-old", tool };
  return null;
}

/**
 * 运行条和脚本输出头部的按钮：运行中是“停止”；没在运行时是“运行”，失败后是“重新运行”；
 * 缺运行环境时是“重新检测”（装好之后再启动一次就是重新检测）
 */
export type RunAction = "stop" | "run" | "rerun" | "recheck";

export function runActionOf(tab: TabRow): RunAction {
  if (tab.active) return "stop";
  if (missingToolStatus(tab) !== null) return "recheck";
  const { state } = tab;
  return state !== "idle" && FAILED.includes(state) ? "rerun" : "run";
}

/** 秒数写到小数点后几位：不到 10 秒两位（0.18），再往上一位（3.2、42.5）；整数不带小数 */
export function secondsOf(ms: number): number {
  const seconds = ms / 1000;
  const digits = seconds < 10 ? 2 : 1;
  return Number(seconds.toFixed(digits));
}
