/// <reference types="node" />
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { build } from "esbuild";

// 由 monaco-test-workers.ts 放进 node 线程里运行（esbuild 在 jsdom 环境里加载不了）：
// 把 ts.worker 打成 CommonJS，线程壳放在最前面，把文件路径发回去。
const { desktop, shim } = workerData as { desktop: string; shim: string };
const dir = join(desktop, "node_modules/.cache/ts-worker-test");
mkdirSync(dir, { recursive: true });
const outfile = join(dir, "ts.worker.cjs");
await build({
  entryPoints: ["monaco-editor/language/typescript/ts.worker.js"],
  absWorkingDir: desktop,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "error",
  banner: { js: shim },
  outfile,
});
parentPort?.postMessage(outfile);
