import type { ShellFailure, TerminalState } from "../../../shared/terminal.ts";

/** 登录 shell 没能启动的原因 → 文案里 select 的分支名（ICU 的分支名不能带连字符） */
export function failureBranch(reason: ShellFailure): string {
  switch (reason) {
    case "not-found":
      return "notFound";
    case "not-executable":
      return "notExecutable";
    case "spawn-failed":
      return "spawnFailed";
    case "exited-early":
      return "exitedEarly";
  }
}

/** 已结束的终端该写哪一句话；还在运行或没有终端是 null */
export type EndedMessage =
  | { key: "exited"; exitCode: number }
  | { key: "signal" }
  | { key: "hostCrashed" }
  | { key: "renamed" }
  | { key: "startFailed" };

export function endedMessage(state: TerminalState): EndedMessage | null {
  if (state.kind !== "ended") return null;
  switch (state.reason) {
    case "exited":
      return state.exitCode === null
        ? { key: "signal" }
        : { key: "exited", exitCode: state.exitCode };
    case "host-crashed":
      return { key: "hostCrashed" };
    case "renamed":
      return { key: "renamed" };
    case "start-failed":
      return { key: "startFailed" };
  }
}
