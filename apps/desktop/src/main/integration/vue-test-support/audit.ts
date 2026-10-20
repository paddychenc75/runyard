import type { SpawnOptions } from "node:child_process";
/** 仅由打包验收脚本注入；不进入产品入口。保留权限参数，只追加只读观察器。 */
export async function installVueAudit(_electron: unknown, observer: string) {
  const childProcess = process.getBuiltinModule("child_process");
  const module = process.getBuiltinModule("module");
  const state = globalThis as unknown as { vueAudit: string[] };
  state.vueAudit = [];
  const original = childProcess.spawn;
  childProcess.spawn = ((
    executable: string,
    args: readonly string[] | SpawnOptions = [],
    options: SpawnOptions = {},
  ) => {
    if (!Array.isArray(args)) return original(executable, args as SpawnOptions);
    const language = Array.isArray(args) && args.includes("--permission");
    const next = language ? [...args] : args;
    if (language && Array.isArray(next)) {
      const at = next.indexOf("--require");
      next.splice(at + 2, 0, "--require", observer);
    }
    const child = original(executable, next as string[], options);
    if (language) {
      state.vueAudit.push(JSON.stringify({ kind: "spawn", pid: child.pid, args: next }));
      let pending = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        let end = pending.indexOf("\n");
        while (end >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          if (line.startsWith("VUE_AUDIT ")) state.vueAudit.push(line.slice(10));
          end = pending.indexOf("\n");
        }
      });
    }
    return child;
  }) as unknown as typeof original;
  module.syncBuiltinESMExports();
}
export function readVueAudit() {
  return (globalThis as unknown as { vueAudit: string[] }).vueAudit;
}
