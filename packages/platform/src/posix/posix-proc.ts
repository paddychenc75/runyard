import type { Platform, ProcRef, TerminateMode } from "../platform.ts";
import { platformError } from "../platform-error.ts";
import type { ProcessEntry, ProcessSource } from "./process-source.ts";

// proc 的 POSIX 实现，算法出自决策记录 0006：
// 整组发信号 → 等 graceMs → 整组强制结束 → 确认组已空。
// 信号和进程组只在这个文件里出现，接口只说 mode（想要的方式）。

const POLL_MS = 10;
/** 强制结束之后等组清空的上限；到时还没空就是真出了问题，报错而不是假装停好了 */
const KILL_WAIT_MS = 5000;

type Signal = "SIGTERM" | "SIGINT" | "SIGKILL";
const FIRST_SIGNAL: Record<TerminateMode, Signal> = {
  graceful: "SIGTERM",
  interrupt: "SIGINT",
  kill: "SIGKILL",
};

export interface PosixProcDeps {
  readonly source: ProcessSource;
  /** 测试替身；默认 process.kill */
  readonly kill?: (pid: number, signal: Signal | 0) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPosixProc(deps: PosixProcDeps): Platform["proc"] {
  const { source } = deps;
  const kill = deps.kill ?? ((pid, signal) => process.kill(pid, signal));
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => performance.now());

  // 这个 ProcRef 名下现在属于我们的组成员；空数组表示“没有什么可碰的”。
  // 任何信号之前都要走一遍（pid 会被系统复用，只凭 pid 会杀错）：
  // - 根进程还在：启动时间必须一致，而且它必须是组长（组号 = pid）
  // - 根进程已经没了：只认组号等于 pid、且启动不早于根进程的成员。系统不会把正在被某个进程组使用的
  //   号码分给新进程，所以组还有成员时，号码没有被复用；“成员启动不早于根进程”再挡一层
  async function ownedMembers(p: ProcRef): Promise<ProcessEntry[]> {
    // pid 0、1 和负数对 kill 有特殊含义（整个系统、自己的组），绝不放行
    if (!Number.isSafeInteger(p.pid) || p.pid <= 1 || p.pid === process.pid) return [];
    const table = await source.snapshot();
    const group = table.filter((entry) => entry.pgid === p.pid);
    const root = table.find((entry) => entry.pid === p.pid);
    if (root) {
      if (root.startTime !== p.startTime || root.pgid !== p.pid) return [];
    } else if (group.some((entry) => entry.startTime < p.startTime)) {
      return [];
    }
    // 绝不碰自己所在的组
    const self = table.find((entry) => entry.pid === process.pid);
    if (self && self.pgid === p.pid) return [];
    return group;
  }

  function groupAlive(pid: number): boolean {
    try {
      kill(-pid, 0);
      return true;
    } catch (error) {
      // EPERM：组存在但有我们无权碰的成员，仍算活着
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  function signalGroup(pid: number, signal: Signal): void {
    try {
      kill(-pid, signal);
    } catch (error) {
      // ESRCH：组在这一瞬间空了，正是想要的结果。
      // EPERM：macOS 上组里只剩已死、还没被回收的进程（僵尸）时会报这个；组是我们自己起的，
      // 不可能真是没权限，所以不当错误，后面的等待会确认组是不是真的空了
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH" || code === "EPERM") return;
      throw platformError("INTERNAL", {}, `cannot signal process group ${pid}: ${String(error)}`);
    }
  }

  async function waitEmpty(pid: number, limitMs: number): Promise<boolean> {
    const deadline = now() + limitMs;
    while (groupAlive(pid)) {
      if (now() >= deadline) return false;
      await sleep(POLL_MS);
    }
    return true;
  }

  return {
    async terminate(p, o) {
      if ((await ownedMembers(p)).length === 0) return;
      signalGroup(p.pid, FIRST_SIGNAL[o.mode]);
      if (o.mode !== "kill") {
        if (await waitEmpty(p.pid, o.graceMs)) return;
        // 升级前再核对一次：等待期间组可能已空、号码可能已被别人用上
        if ((await ownedMembers(p)).length === 0) return;
        signalGroup(p.pid, "SIGKILL");
      }
      if (!(await waitEmpty(p.pid, KILL_WAIT_MS))) {
        throw platformError(
          "INTERNAL",
          {},
          `process group ${p.pid} still has members ${KILL_WAIT_MS} ms after the forced stop`,
        );
      }
    },
    async members(p) {
      return (await ownedMembers(p)).map((entry) => entry.pid).sort((a, b) => a - b);
    },
    async identity(pid) {
      const startTime = await source.startTime(pid);
      return startTime === null ? null : { startTime };
    },
  };
}
