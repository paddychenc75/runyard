// 运行引擎需要的最小时钟。FakeClock 在结构上满足它，所以本包的生产代码不必导入 @runyard/testing；
// 真实时钟由 supervisor 用 setTimeout 包一层给进来。
export interface RunClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export function sleepOn(clock: RunClock, ms: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms);
  });
}
