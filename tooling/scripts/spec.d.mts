export function specEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function openspecBin(root?: string): string;
export function runSpec(
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): import("node:child_process").SpawnSyncReturns<Buffer>;
