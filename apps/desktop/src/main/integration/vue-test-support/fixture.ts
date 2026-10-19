import { cpSync, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import type { Platform, ProcRef } from "@runyard/platform";

export function copyVueTypes(project: string, from: string): void {
  const copied = new Set<string>();
  function copy(name: string, start: string) {
    if (copied.has(name)) return;
    copied.add(name);
    let dir = start;
    while (!existsSync(join(dir, "node_modules", name, "package.json"))) {
      // i18n-allow: 仅测试夹具的开发者诊断，不进入产品。
      if (dirname(dir) === dir) throw new Error(`找不到 ${name}`);
      dir = dirname(dir);
    }
    const source = realpathSync(join(dir, "node_modules", name));
    cpSync(source, join(project, "node_modules", name), {
      recursive: true,
      filter: (path) =>
        path === source ||
        (statSync(path).isDirectory()
          ? !path.endsWith(`${sep}node_modules`)
          : path.endsWith("package.json") || /\.d\.[cm]?ts$/.test(path)),
    });
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) copy(dependency, source);
  }
  copy("vue", from);
}
export function registerLanguageProcess(platform: Platform, ref: ProcRef): void {
  const key = Symbol.for("runyard.test.spawned-processes");
  const holder = globalThis as unknown as Record<
    symbol,
    Set<{ pid: number; alive(): Promise<boolean>; kill(): void }> | undefined
  >;
  const entries = holder[key] ?? new Set();
  holder[key] = entries;
  entries.add({
    pid: ref.pid,
    alive: async () => (await platform.proc.identity(ref.pid))?.startTime === ref.startTime,
    kill: () => {
      void platform.proc.terminate(ref, { mode: "kill", graceMs: 0 });
    },
  });
}
