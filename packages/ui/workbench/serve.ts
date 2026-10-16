import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveWorkbench } from "./build.ts";

// pnpm ui:dev：在 127.0.0.1 上打开工作台（--port <端口>，不传就让系统挑一个）。
// 输出放在系统临时目录，不进仓库。Ctrl+C 结束。
const portFlag = process.argv.indexOf("--port");
const port = portFlag === -1 ? 0 : Number(process.argv[portFlag + 1]);
const outDir = mkdtempSync(join(tmpdir(), "runyard-workbench-"));
const { url, stop } = await serveWorkbench(outDir, port);
process.stdout.write(`工作台：${url}\n`);
const shutdown = () =>
  void stop().then(() => {
    rmSync(outDir, { recursive: true, force: true }); // delete-allow: 本进程刚建的临时输出目录
    process.exit(0);
  });
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
