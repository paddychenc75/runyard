import { createRequire } from "node:module";
import { mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const repo = "/Users/fengchen/Desktop/vibe-code/runyard-worktrees/m252/apps/desktop";
const { build } = createRequire(join(repo, "package.json"))("esbuild");
const out = process.argv[2];            // output renderer dir
const fontMode = process.argv[3] ?? "file"; // file | dataurl
mkdirSync(join(out, "workers"), { recursive: true });
const common = { bundle: true, minify: true, sourcemap: false, logLevel: "warning", target: "chrome140", platform: "browser", define: { "process.env.NODE_ENV": '"production"' }, nodePaths: [join(process.cwd(), "node_modules")] };
const loaders = { ".ttf": fontMode === "dataurl" ? "dataurl" : "file" };
await build({ ...common, entryPoints: { main: "src/main.ts", "main-zh": "src/main-zh.ts" }, outdir: out, format: "iife", loader: loaders, assetNames: "[name]-[hash]" });
const workers = { "editor.worker": "monaco-editor/editor/editor.worker.js", "ts.worker": "monaco-editor/language/typescript/ts.worker.js", "css.worker": "monaco-editor/language/css/css.worker.js", "html.worker": "monaco-editor/language/html/html.worker.js", "json.worker": "monaco-editor/language/json/json.worker.js" };
await build({ ...common, entryPoints: workers, outdir: join(out, "workers"), format: "iife" });
console.log("built", out, fontMode);
