import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
const repo = "/Users/fengchen/Desktop/vibe-code/runyard-worktrees/m252/apps/desktop";
const { build } = createRequire(join(repo, "package.json"))("esbuild");
const out = mkdtempSync(join(process.cwd(), "meta."));
const r = await build({ entryPoints: { main: "src/main.ts" }, bundle: true, minify: true, metafile: true, outdir: out, format: "iife", loader: { ".ttf": "file" }, target: "chrome140", platform: "browser", logLevel: "error", define: { "process.env.NODE_ENV": '"production"' } });
const o = Object.entries(r.metafile.outputs).find(([k]) => k.endsWith("main.js"))[1];
const groups = {};
for (const [p, v] of Object.entries(o.inputs)) {
  const g = p.includes("node_modules/.pnpm/@shikijs+langs") || p.includes("shiki/dist/langs") ? "shiki grammars" : p.includes("shiki") || p.includes("vscode-textmate") ? "shiki core+engine+themes" : p.includes("monaco-editor/esm/vs/language") ? "monaco language services (ts/css/html/json client)" : p.includes("monaco-editor") ? "monaco core" : "other";
  groups[g] = (groups[g] ?? 0) + v.bytesInOutput;
}
console.log(JSON.stringify(groups, null, 1));
const gz = (await import("node:zlib")).gzipSync((await import("node:fs")).readFileSync(join(out, "main.js"))).length;
console.log("main.js gzip", gz);
