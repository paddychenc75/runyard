import { createDeps, developmentConfig } from "./composition-root.ts";
import { runCli } from "./run-cli.ts";

// 进程入口：只做接线，逻辑都在 runCli 里（那里可以不起进程直接测试）。
// 不读标准输入：命令行始终非交互。
process.exitCode = await runCli(
  {
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  },
  createDeps(developmentConfig()),
);
// 管理进程连接是脱钩的，但保险起见不让残留句柄拖住退出
process.exit();
