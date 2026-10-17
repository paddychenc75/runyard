import type { RunState } from "@runyard/protocol";
import type { ConsoleLine } from "../../shared/console-state.ts";
import type { StartPhaseMs } from "../../shared/library-state.ts";
import type { StartStep } from "./failure-view.ts";

// 创建后启动清单的纯判断（规格 DESKTOP-CREATE-FLOW-14）：哪一步在做、每步写什么时间、日志摘要显示哪一行。

export type StepStatus = "done" | "current" | "pending";

export const START_STEPS: readonly StartStep[] = ["copy", "install", "start", "ready"];

/** 启动阶段的运行状态；预览区在这几个状态下显示启动清单 */
export const STARTING_STATES: readonly (RunState | "idle")[] = [
  "checking",
  "installing",
  "starting",
  "ready",
];

/**
 * 运行状态对应的清单：项目是先建好才运行的，所以“复制”从一开始就是完成；
 * 检查环境和安装依赖合在“安装依赖”一步里（检查很快，单独列一步只会一闪而过）；就绪后全部完成。
 */
export function startStatusesOf(state: RunState | "idle"): Record<StartStep, StepStatus> {
  switch (state) {
    case "starting":
      return { copy: "done", install: "done", start: "current", ready: "pending" };
    case "ready":
      return { copy: "done", install: "done", start: "done", ready: "done" };
    default:
      return { copy: "done", install: "current", start: "pending", ready: "pending" };
  }
}

/** 每一步右边的用时（毫秒）；没跑完或没量到是 null */
export function stepMsOf(step: StartStep, phases: StartPhaseMs): number | null {
  switch (step) {
    case "copy":
      return phases.copy;
    case "install":
      return phases.install;
    case "start":
      return phases.start;
    case "ready":
      return null;
  }
}

/** 一位小数的秒数（0.1、2.4）；界面再套“{秒} 秒” */
export function secondsWithTenths(ms: number): number {
  return Math.round(Math.max(0, ms) / 100) / 10;
}

/** 日志摘要框显示的一行：最近一行进程输出或命令（管理进程自己插入的提示不算） */
export function lastOutputLine(lines: readonly ConsoleLine[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = lines[index]?.entry;
    if (entry === undefined || entry.kind === "system") continue;
    const text = entry.kind === "command" ? `$ ${entry.text}` : entry.text;
    if (text.trim() !== "") return text;
  }
  return null;
}
