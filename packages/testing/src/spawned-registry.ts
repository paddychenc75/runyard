import type { Platform, ProcRef } from "@runyard/platform";

// 进程测试阶段的遗留进程登记处（协议与核对方在 tooling/vitest/spawned-registry.ts、process-guard.setup.ts）。
// 测试里起了真进程（pid 加启动时间已知）就登记：测试文件结束时如果它还活着，
// 守卫会结束它并让这个文件失败。身份不一致（pid 被别的进程用了）不算活着。

const KEY = Symbol.for("runyard.test.spawned-processes");

interface Entry {
  readonly pid: number;
  alive(): Promise<boolean>;
  kill(): void;
}

export function registerSpawned(platform: Platform, ref: ProcRef): void {
  const holder = globalThis as unknown as Record<symbol, Set<Entry> | undefined>;
  const registry = holder[KEY] ?? new Set<Entry>();
  holder[KEY] = registry;
  registry.add({
    pid: ref.pid,
    alive: async () => (await platform.proc.identity(ref.pid))?.startTime === ref.startTime,
    kill: () => {
      try {
        process.kill(ref.pid, "SIGKILL");
      } catch {
        // 刚好退出了
      }
    },
  });
}
