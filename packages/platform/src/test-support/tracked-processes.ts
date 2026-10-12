import { execFileSync } from "node:child_process";
import { registerSpawned } from "./spawned-registry.ts";

// 测试里起的每个进程都记下 pid 加启动时间，收尾时只结束“还是当初那个”的进程（决策记录 0006：只凭 pid 或名字会杀错）。
// 平台层的 proc.identity 在 #25 才有，所以这里直接问 ps；这些测试本来就是平台相关的。

export function startTimeOf(pid: number): string | null {
  try {
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
    return out.trim() === "" ? null : out.trim();
  } catch {
    return null;
  }
}

export function parentPidOf(pid: number): number | null {
  try {
    return Number(execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

export function processGroupOf(pid: number): number | null {
  try {
    return Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class TrackedProcesses {
  private readonly entries = new Map<number, string>();

  /** 记下一个进程；已经不存在就什么也不记 */
  track(pid: number): void {
    const start = startTimeOf(pid);
    if (start === null) return;
    this.entries.set(pid, start);
    registerSpawned({
      pid,
      alive: () => startTimeOf(pid) === start,
      kill: () => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // 刚好退出了
        }
      },
    });
  }

  /** 结束全部记过的进程（核对启动时间），并返回仍然存活的 pid（应为空） */
  async killAll(): Promise<number[]> {
    for (const [pid, start] of this.entries) {
      if (startTimeOf(pid) === start) process.kill(pid, "SIGKILL");
    }
    const survivors: number[] = [];
    for (const [pid, start] of this.entries) {
      for (let i = 0; i < 750 && startTimeOf(pid) === start; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (startTimeOf(pid) === start) survivors.push(pid);
    }
    this.entries.clear();
    return survivors;
  }
}
