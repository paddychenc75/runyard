import { runSupervisorMain } from "./run-main.ts";

// 管理进程的入口：`node main.ts --home <状态目录的上一级> --version <版本> --build <构建标识> …`。
// 纯 JS，不导入 Electron，普通 Node 24 直接运行；应用里用 ELECTRON_RUN_AS_NODE 拉起（#44）。
process.exitCode = await runSupervisorMain(process.argv.slice(2));
// 事件循环里没有别的东西时 Node 会自己退出；显式退出是为了不被残留的句柄拖住
process.exit();
