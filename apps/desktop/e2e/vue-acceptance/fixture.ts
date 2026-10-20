import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import type { RunyardApp } from "../support/launch.ts";

export const APP_TEXT =
  '<script setup lang="ts">\nimport Child from "./Child.vue";\nimport { ref } from "vue";\nconst n = ref(1);\n</script>\n<template>\n  \n</template>\n';
export const CHILD_TEXT =
  '<script setup lang="ts">\ndefineProps<{ title: string; count: number; tone?: "info" | "warn" }>();\ndefineEmits<{ select: [id: number]; close: [] }>();\n</script>\n<template><button>{{ title }}</button></template>\n';

export async function command(platform: Platform, cwd: string, argv: string[], env = process.env) {
  const strings = Object.fromEntries(
    Object.entries(env).filter((item): item is [string, string] => typeof item[1] === "string"),
  );
  const child = platform.exec.spawn({ argv, cwd: absPath(cwd), env: strings, stdin: false });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const result = await child.exited;
  return { code: result.exitCode, stdout, stderr };
}
export function fileHashes(folder: string, dependencies = true): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (path: string, prefix: string) => {
    for (const name of readdirSync(path).sort()) {
      if (!dependencies && name === "node_modules") continue;
      const file = join(path, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const info = lstatSync(file);
      if (info.isSymbolicLink()) {
        result[relative] = `link:${readlinkSync(file)}`;
        continue;
      }
      if (info.isDirectory()) walk(file, relative);
      else result[relative] = createHash("sha256").update(readFileSync(file)).digest("hex");
    }
  };
  walk(folder, "");
  return result;
}
export async function prepareDependencies(output: string): Promise<string> {
  const root = join(output, "dependency-cache");
  if (existsSync(join(output, "dependencies-ready.json"))) return join(root, "node_modules");
  cpSync(resolve(import.meta.dirname, "../../../../templates/builtin/vue3/files"), root, {
    recursive: true,
  });
  const home = join(output, "install-home");
  mkdirSync(home, { recursive: true });
  const platform = getPlatform({ home: absPath(home) });
  const store = await command(platform, root, ["pnpm", "store", "path"]);
  const cache = await command(platform, root, ["pnpm", "cache", "path"]);
  const result = await command(
    platform,
    root,
    [
      "pnpm",
      "install",
      "--offline",
      "--ignore-scripts",
      "--frozen-lockfile",
      "--store-dir",
      store.stdout.trim(),
      "--cache-dir",
      cache.stdout.trim(),
    ],
    { ...process.env, HOME: home },
  );
  writeFileSync(join(output, "dependency-install.log"), `${result.stdout}\n${result.stderr}`);
  if (result.code !== 0)
    throw new Error(`模板离线依赖准备失败，检查 ${join(output, "dependency-install.log")}`);
  writeFileSync(
    join(output, "dependencies-ready.json"),
    JSON.stringify({
      mode: "offline-frozen-lockfile-ignore-scripts",
      store: store.stdout.trim(),
      cache: cache.stdout.trim(),
    }),
  );
  return join(root, "node_modules");
}
export async function createProject(
  instance: RunyardApp,
  name: string,
  dependencies: string,
  count?: number,
) {
  await instance.cli("new", "vue3", name);
  const folder = realpathSync(join(instance.library, name));
  cpSync(dependencies, join(folder, "node_modules"), {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  const vuePath = relative(folder, realpathSync(join(folder, "node_modules", "vue")));
  if (vuePath.startsWith("..") || isAbsolute(vuePath))
    throw new Error("测量夹具的 Vue 依赖必须解析到项目内");
  writeFileSync(join(folder, "src", "App.vue"), APP_TEXT);
  writeFileSync(join(folder, "src", "Child.vue"), CHILD_TEXT);
  if (count) {
    const initial = Object.keys(fileHashes(folder, false)).length;
    mkdirSync(join(folder, "src", "extra"), { recursive: true });
    for (let i = initial; i < count; i++)
      writeFileSync(
        join(folder, "src", "extra", `item-${i}.ts`),
        `export const item${i} = ${i};\n`,
      );
  }
  await instance.page.waitForFunction(
    async (name) => {
      const bridge = (
        window as unknown as {
          runyard: {
            call(method: string): Promise<{ playgrounds: { id: string; name: string }[] }>;
          };
        }
      ).runyard;
      return (await bridge.call("library.get")).playgrounds.some((entry) => entry.name === name);
    },
    name,
    { polling: "raf" },
  );
  const id = (
    await instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get")
  ).playgrounds.find((entry) => entry.name === name)?.id;
  if (!id) throw new Error("测试项目没有出现在资源库");
  return { id, folder, count: Object.keys(fileHashes(folder, false)).length };
}
export interface LanguageProcessSample {
  pid: number;
  ppid: number;
  rssKiB: number;
  target: "ts" | "vue";
  project: string;
  ref: ProcRef;
}
export async function languageProcesses(instance: RunyardApp): Promise<LanguageProcessSample[]> {
  const snapshot = await command(instance.platform, instance.home, [
    "/bin/ps",
    "-axo",
    "pid=,ppid=,rss=,command=",
  ]);
  const parent = instance.app.process().pid;
  const result: LanguageProcessSample[] = [];
  for (const line of snapshot.stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match || Number(match[2]) !== parent) continue;
    const argv = match[4] ?? "";
    if (!argv.includes("--permission")) continue;
    const target = argv.includes("vue-language-server.cjs")
      ? "vue"
      : argv.includes("tsserver.js")
        ? "ts"
        : null;
    const project = /--allow-fs-read=([^ ]+)/.exec(argv)?.[1];
    if (!target || !project) continue;
    const pid = Number(match[1]);
    const identity = await instance.platform.proc.identity(pid);
    if (identity)
      result.push({
        pid,
        ppid: Number(match[2]),
        rssKiB: Number(match[3]),
        target,
        project,
        ref: { pid, startTime: identity.startTime },
      });
  }
  return result;
}
export async function assertGone(instance: RunyardApp, processes: LanguageProcessSample[]) {
  for (const item of processes) {
    const current = await instance.platform.proc.identity(item.pid);
    if (current?.startTime === item.ref.startTime) throw new Error(`语言服务 ${item.pid} 没有退出`);
  }
}
export function packageFiles(executable: string) {
  const app = resolve(dirname(executable), "..", "..");
  const service = join(app, "Contents", "Resources", "vue-language-service");
  if (!existsSync(service)) throw new Error("必须在真实打包应用上测量");
  return { app, service };
}
