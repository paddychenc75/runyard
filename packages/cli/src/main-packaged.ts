import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type BundleManifest, createDeps, packagedConfig } from "./composition-root.ts";
import { runCli } from "./run-cli.ts";

// 随桌面应用安装的命令行入口：打包脚本把本文件连同依赖打成资源目录里的 runyard/cli.mjs，
// 由 bin/runyard 用应用自带的运行时（ELECTRON_RUN_AS_NODE）执行。逻辑与 main.ts 相同，只是配置取自旁边的清单。
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("./manifest.json", import.meta.url)), "utf8"),
) as BundleManifest;

process.exitCode = await runCli(
  {
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  },
  createDeps(packagedConfig(import.meta.url, manifest)),
);
process.exit();
