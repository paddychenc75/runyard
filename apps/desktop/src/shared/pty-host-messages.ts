import type { ShellNotice } from "./terminal.ts";

// 主进程和 pty-host（终端的后台进程，技术设计 §6.3）之间的消息。pty-host 对收到的命令逐项校验，形状不对就丢掉；
// 主进程信任 pty-host（同一个应用的自己的进程）。
// 数量用字符数（UTF-16 单位）算，主进程回执多少，pty-host 就当多少已处理。

/** 主进程发给 pty-host */
export type HostCommand =
  | {
      type: "open";
      project: string;
      cwd: string;
      cols: number;
      rows: number;
      /** 叠加在 pty-host 自己环境上的变量（运行命令所在目录等）；pty-host 再整理出终端里的环境 */
      env: Record<string, string>;
      /** 这个终端的标记值（环境变量 TERMINAL_MARKER_ENV 的值），结束时按它找全部后代 */
      marker: string;
      /** 随应用安装的 runyard 启动脚本所在目录，放进终端的 PATH 最前面；开发时源码里没有 */
      runyardBinDir?: string;
    }
  | { type: "write"; project: string; data: string }
  | { type: "resize"; project: string; cols: number; rows: number }
  | { type: "ack"; project: string; length: number }
  /** 结束这个项目的终端，连 shell 里启动的命令一起（含后台作业）；做完回 closed */
  | { type: "end"; project: string; id: number }
  | { type: "foreground"; project: string; id: number };

/** pty-host 发给主进程 */
export type HostEvent =
  | { type: "ready" }
  | {
      type: "started";
      project: string;
      pid: number;
      /** 进程启动时间（平台层的进程身份），主进程在后台进程意外结束时靠 pid 加它清理 */
      startTime: number | null;
      shell: string;
      notice?: ShellNotice;
    }
  | { type: "start-failed"; project: string }
  | { type: "data"; project: string; data: string }
  | { type: "exit"; project: string; exitCode: number | null; requested: boolean }
  | { type: "closed"; project: string; id: number }
  | { type: "foreground"; project: string; id: number; command: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function size(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) < 10_000;
}

/** 解析主进程发来的命令；形状不对是 null */
export function parseHostCommand(value: unknown): HostCommand | null {
  const m = record(value);
  if (m === null || typeof m.project !== "string" || m.project === "") return null;
  const project = m.project;
  switch (m.type) {
    case "open": {
      const env = record(m.env);
      if (typeof m.cwd !== "string" || !size(m.cols) || !size(m.rows) || env === null) return null;
      if (typeof m.marker !== "string" || m.marker === "") return null;
      const clean: Record<string, string> = {};
      for (const [key, v] of Object.entries(env)) if (typeof v === "string") clean[key] = v;
      return {
        type: "open",
        project,
        cwd: m.cwd,
        cols: m.cols,
        rows: m.rows,
        env: clean,
        marker: m.marker,
        ...(typeof m.runyardBinDir === "string" ? { runyardBinDir: m.runyardBinDir } : {}),
      };
    }
    case "write":
      return typeof m.data === "string" ? { type: "write", project, data: m.data } : null;
    case "resize":
      return size(m.cols) && size(m.rows)
        ? { type: "resize", project, cols: m.cols, rows: m.rows }
        : null;
    case "ack":
      return Number.isInteger(m.length) && (m.length as number) >= 0
        ? { type: "ack", project, length: m.length as number }
        : null;
    case "end":
    case "foreground":
      return Number.isInteger(m.id) ? { type: m.type, project, id: m.id as number } : null;
    default:
      return null;
  }
}
