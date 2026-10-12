// 进程测试阶段的“遗留进程登记处”：测试里起的每个进程都在这里记一笔，整个测试文件结束后由
// process-guard.setup.ts 统一核对，还活着的就结束并让这个文件失败。
//
// 登记处是挂在 globalThis 上的一个集合，各包的测试辅助代码按同样的键写入，彼此不必互相导入
// （platform 不能导入 testing，测试辅助代码也不能导入 tooling）。写入方见：
// packages/platform/src/test-support/spawned-registry.ts 和 packages/testing/src/spawned-registry.ts。
export const SPAWNED_REGISTRY_KEY = Symbol.for("runyard.test.spawned-processes");

/** 一个登记项。alive 必须按“pid 加启动时间”判断身份，pid 被别的进程用了不算（决策记录 0006） */
export interface SpawnedEntry {
  readonly pid: number;
  alive(): boolean | Promise<boolean>;
  /** 只在 alive() 刚返回 true 时调用 */
  kill(): void;
}

export function spawnedRegistry(): Set<SpawnedEntry> {
  const holder = globalThis as unknown as Record<symbol, Set<SpawnedEntry> | undefined>;
  let registry = holder[SPAWNED_REGISTRY_KEY];
  if (!registry) {
    registry = new Set();
    holder[SPAWNED_REGISTRY_KEY] = registry;
  }
  return registry;
}

/** 核对全部登记项：结束还活着的，返回它们的 pid；同时清空登记处 */
export async function reapSpawned(): Promise<number[]> {
  const registry = spawnedRegistry();
  const leaked: number[] = [];
  for (const entry of registry) {
    if (await entry.alive()) {
      leaked.push(entry.pid);
      entry.kill();
    }
  }
  registry.clear();
  return leaked;
}
