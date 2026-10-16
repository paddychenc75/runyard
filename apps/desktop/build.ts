import { cpSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

// 把主进程、预加载脚本、界面三部分打包到 dist/。不用 electron-vite：它要 Vite 7，
// 而 Vite 7.3.7 属于安全修复例外、需要放宽安装的年龄限制，改用已批准的 esbuild（docs/architecture/dependencies.md）。
// 内部包的入口是 TypeScript 源文件，由 esbuild 一起打进来。

const common = { bundle: true, sourcemap: true, logLevel: "info" } as const;

mkdirSync("dist/renderer", { recursive: true });

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main/index.mjs",
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["electron"],
    // 打进来的 CommonJS 依赖需要 require
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
  }),
  build({
    ...common,
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload/index.cjs",
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: ["src/renderer/main.tsx"],
    outfile: "dist/renderer/main.js",
    // React 界面：样式（设计变量、组件的 CSS Modules）随脚本打成同名的 main.css；
    // .module.css 默认是带散列类名的局部样式
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    // platform 为 browser：界面里误用 Node 的东西会在这里直接报错
    platform: "browser",
    format: "iife",
    target: "chrome140",
  }),
]);

cpSync("src/renderer/index.html", "dist/renderer/index.html");
