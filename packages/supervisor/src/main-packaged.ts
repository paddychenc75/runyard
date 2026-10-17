import { runSupervisorMain } from "./run-main.ts";
import { templateDirsUnder } from "./template-dirs.ts";

// 随桌面应用打包的管理进程入口（技术设计 §8.2）：打包脚本把本文件连同依赖打成资源目录里的
// runyard/supervisor.mjs，模板数据在它旁边的 templates/ 下。用应用自带的运行时（ELECTRON_RUN_AS_NODE）执行。
process.exitCode = await runSupervisorMain(
  process.argv.slice(2),
  templateDirsUnder(new URL("./templates/", import.meta.url)),
);
process.exit();
