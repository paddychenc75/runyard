/// <reference types="node" />
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { build } from "esbuild";

// 由 monaco-test-workers.ts 放进 node 线程里运行（esbuild 在 jsdom 环境里加载不了）：
// 把 ts、css、html、json、editor 几个 worker 打成 CommonJS，线程壳放在最前面，把名字到文件路径的对应发回去。
const { desktop, shim } = workerData as { desktop: string; shim: string };
const dir = join(desktop, "node_modules/.cache/ts-worker-test");
mkdirSync(dir, { recursive: true });
const entries = {
  "ts.worker": "monaco-editor/language/typescript/ts.worker.js",
  "css.worker": "monaco-editor/language/css/css.worker.js",
  "html.worker": "monaco-editor/language/html/html.worker.js",
  "json.worker": "monaco-editor/language/json/json.worker.js",
  "editor.worker": "monaco-editor/editor/editor.worker.js",
};
const files: Record<string, string> = {};
await Promise.all(
  Object.entries(entries).map(async ([name, entry]) => {
    const outfile = join(dir, `${name}.cjs`);
    await build({
      entryPoints: [entry],
      absWorkingDir: desktop,
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "error",
      banner: { js: shim },
      outfile,
    });
    files[name] = outfile;
  }),
);
parentPort?.postMessage(files);
