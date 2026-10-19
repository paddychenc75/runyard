import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { context } from "esbuild";

/** 独立测试入口；生产 build.ts 和 pack.ts 不引用此文件。仅绑定回环地址。 */
export async function serveScreens(outdir: string) {
  mkdirSync(outdir, { recursive: true });
  copyFileSync(join(import.meta.dirname, "index.html"), join(outdir, "index.html"));
  const builder = await context({
    entryPoints: [join(import.meta.dirname, "main.tsx")],
    outdir,
    bundle: true,
    format: "esm",
    target: "chrome152",
    jsx: "automatic",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "silent",
  });
  const server = await builder.serve({ host: "127.0.0.1", port: 0, servedir: outdir });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => builder.dispose() };
}
