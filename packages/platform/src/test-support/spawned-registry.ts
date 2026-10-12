// 进程测试阶段的遗留进程登记处（协议与核对方在 tooling/vitest/spawned-registry.ts、process-guard.setup.ts）。
// platform 不能导入别的测试包，也不能导入 tooling，所以按同一个全局键写入。

const KEY = Symbol.for("runyard.test.spawned-processes");

interface Entry {
  readonly pid: number;
  alive(): boolean | Promise<boolean>;
  kill(): void;
}

/** 登记一个测试里起的进程。alive 必须按 pid 加启动时间判断，kill 只在 alive 刚为真时才会被调用 */
export function registerSpawned(entry: Entry): void {
  const holder = globalThis as unknown as Record<symbol, Set<Entry> | undefined>;
  const registry = holder[KEY] ?? new Set<Entry>();
  holder[KEY] = registry;
  registry.add(entry);
}
