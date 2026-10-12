// 包的唯一入口。只在测试里导入本包（tooling/checks/testing-imports.ts 守着）。
export { type Clock, FAKE_EPOCH, FakeClock, settle, type TimerId } from "./fake-clock.ts";
export {
  createFakePlatform,
  type DesktopCall,
  type FakePlatform,
  type FakePlatformOptions,
} from "./fake-platform.ts";
export { FakePorts, type PortOccupant } from "./fake-ports.ts";
export { FakeProcesses } from "./fake-processes.ts";
export { FakeEnv, type FakeToolSpec, FakeTools } from "./fake-toolchain.ts";
export { MemoryFs, type TrashedEntry } from "./memory-fs.ts";
export type {
  BehaviorSource,
  ChildSpec,
  ProcessBehavior,
  ProcessMatcher,
  ScriptedOutput,
  SpawnRecord,
  SpawnSpec,
} from "./process-behavior.ts";
export { registerSpawned } from "./spawned-registry.ts";
export { createTempHome, type TempHome } from "./temp-home.ts";
