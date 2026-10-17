import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BuildOptions, build } from "esbuild";

// 编辑器的构建（决策记录 0020）：Monaco 和 Shiki 打成单独的 editor/editor.js（IIFE，和主脚本分开，
// 启动后空闲时才加载），样式 editor/editor.css，图标字体以文件形式放在旁边；
// 后台线程各打成独立文件放在 workers/，由 app://runyard/ 提供，不走 CDN。
// 还派生一个冒烟页：和 index.html 同一份内容安全策略，只把脚本换成 editor-smoke.js。

const browser: BuildOptions = {
  bundle: true,
  minify: true,
  logLevel: "warning",
  platform: "browser",
  format: "iife",
  target: "chrome140",
  define: { "process.env.NODE_ENV": '"production"' },
};

export async function buildEditor(rendererDir: string): Promise<void> {
  mkdirSync(join(rendererDir, "workers"), { recursive: true });
  await Promise.all([
    build({
      ...browser,
      entryPoints: { "editor/editor": "src/renderer/editor/entry.ts" },
      outdir: rendererDir,
      // 字体放在 editor/ 下，样式里用相对地址引用
      loader: { ".ttf": "file" },
      assetNames: "editor/[name]-[hash]",
    }),
    build({
      ...browser,
      entryPoints: { "editor-smoke": "src/renderer/editor/smoke-entry.ts" },
      outdir: rendererDir,
    }),
    build({
      ...browser,
      entryPoints: {
        "editor.worker": "monaco-editor/editor/editor.worker.js",
        "ts.worker": "monaco-editor/language/typescript/ts.worker.js",
      },
      outdir: join(rendererDir, "workers"),
    }),
  ]);
  const index = readFileSync("src/renderer/index.html", "utf8");
  const smoke = index
    .replace('<link rel="stylesheet" href="app://runyard/main.css" />', "")
    .replace('src="app://runyard/main.js"', 'src="app://runyard/editor-smoke.js"');
  if (smoke === index)
    throw new Error("index.html changed shape; update the smoke page derivation");
  writeFileSync(join(rendererDir, "editor-smoke.html"), smoke);
}
