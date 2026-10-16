import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, build, context } from "esbuild";

// 工作台的构建：esbuild 把 main.tsx 连同样式打成 main.js 和 main.css，和 index.html 放在一个目录里。
// 为什么不用 Vite：它在仓库里还没装，且满 14 天的无公告版本要到 2026-10-20 之后才有（docs/architecture/dependencies.md）；
// esbuild 已经在依赖表里，打一个静态页够用。截图流水线（ui-visual）也是打开这个目录里的页面。

const here = dirname(fileURLToPath(import.meta.url));

export function workbenchBuildOptions(outDir: string): BuildOptions {
  return {
    entryPoints: [join(here, "main.tsx")],
    outdir: outDir,
    entryNames: "main",
    bundle: true,
    format: "esm",
    target: "chrome152",
    jsx: "automatic",
    // .module.css 默认就是 local-css（类名带散列）；别的 .css 是全局样式
    // 样式里 url() 引用的图片（工作台的彩色底图）内联进 main.css，页面不依赖额外文件
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    sourcemap: true,
    logLevel: "silent",
  };
}

function copyIndex(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(here, "index.html"), join(outDir, "index.html"));
}

/** 一次性构建到 outDir（测试和截图流水线用） */
export async function buildWorkbench(outDir: string): Promise<void> {
  copyIndex(outDir);
  await build(workbenchBuildOptions(outDir));
}

/** 监听并在本机端口上提供 outDir；返回地址和停止函数 */
export async function serveWorkbench(
  outDir: string,
  port = 0,
): Promise<{ url: string; stop: () => Promise<void> }> {
  copyIndex(outDir);
  const ctx = await context(workbenchBuildOptions(outDir));
  await ctx.watch();
  const server = await ctx.serve({ host: "127.0.0.1", port, servedir: outDir });
  return {
    url: `http://127.0.0.1:${server.port}/`,
    stop: () => ctx.dispose(),
  };
}
