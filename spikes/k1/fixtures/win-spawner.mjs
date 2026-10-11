// 只在 Windows 的“黑窗口”实验里用：本进程像管理进程一样没有控制台（由测试程序以 detached 方式启动），
// 再启动一个控制台程序（node），windowsHide 由参数决定。把子进程号写进文件，然后等着被杀。
// 用法：node win-spawner.mjs <true|false> <端口> <输出文件> <标记>
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const [hide, port, outFile, marker] = process.argv.slice(2);
const child = spawn(process.execPath, [fileURLToPath(new URL("./http-server.mjs", import.meta.url)), port, marker], {
  stdio: "ignore",
  windowsHide: hide === "true",
});
fs.writeFileSync(outFile, JSON.stringify({ spawner: process.pid, child: child.pid }));
setTimeout(() => process.exit(0), 60_000);
