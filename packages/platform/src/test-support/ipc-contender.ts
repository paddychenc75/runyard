// 测试用的“启动者”进程：收到 go 就调用 platform.ipc.listen()，赢了就占着，直到标准输入关闭。
// 用法：node ipc-contender.ts <home>
// 输出：先一行 READY（模块加载完），收到 go 后一行 WON 或 LOST:<错误码>。
// 它代表管理进程的启动路径，不含握手（握手是 #39、#44）。
import { getPlatform } from "../get-platform.ts";
import type { AbsPath } from "../path-types.ts";
import { isPlatformError } from "../platform-error.ts";

const home = process.argv[2] as AbsPath;
const platform = getPlatform({ home, profile: undefined });

let go!: () => void;
const started = new Promise<void>((resolve) => {
  go = resolve;
});
let closing!: () => void;
const stdinEnded = new Promise<void>((resolve) => {
  closing = resolve;
});
process.stdin.on("data", go);
process.stdin.on("end", closing);
process.stdout.write("READY\n");

await started;
try {
  const server = await platform.ipc.listen();
  process.stdout.write("WON\n");
  await stdinEnded;
  server.close();
} catch (error) {
  process.stdout.write(`LOST:${isPlatformError(error) ? error.error.code : String(error)}\n`);
}
