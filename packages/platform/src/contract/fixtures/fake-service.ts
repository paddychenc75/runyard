import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

// 契约测试用的假程序：按一份 JSON 配置扮演“会生子孙、占端口、不听话”的开发服务器。
// 用法：node fake-service.ts '<配置 JSON>'。它自己和每个后代都往（共用的）标准输出写 `up <pid>`，
// 监听成功再写 `listening <pid>`，测试靠这些行知道进程树起好了、各进程的 pid 是多少。

interface Config {
  /** 监听 127.0.0.1:<port> */
  listen?: number;
  /** 忽略终止请求（SIGTERM），模拟“不听话”的进程 */
  ignoreTerm?: boolean;
  /** 忽略中断（SIGINT）；和 ignoreTerm 一起用就只剩强制结束能停它 */
  ignoreInterrupt?: boolean;
  /** 收到中断后正常退出，模拟 Go 的运行器：它只响应中断，忽略终止请求 */
  exitOnInterrupt?: boolean;
  /** 这么多毫秒后自己退出（用来造“根进程先走、后代还在”和“停止途中自己退出”） */
  exitAfterMs?: number;
  /** 后代，和本进程同一个进程组，共用标准输出 */
  children?: Config[];
  /** 为 true 时，这个进程是由父进程“脱离进程组”起的（自成一组），模拟 Next 退出时另起的遥测进程 */
  detached?: boolean;
}

const config: Config = JSON.parse(process.argv[2] ?? "{}");
const self = fileURLToPath(import.meta.url);

const ignore = () => {};
if (config.ignoreTerm || config.exitOnInterrupt) process.on("SIGTERM", ignore);
if (config.ignoreInterrupt) process.on("SIGINT", ignore);
if (config.exitOnInterrupt) process.on("SIGINT", () => process.exit(0));

for (const child of config.children ?? []) {
  spawn(process.execPath, [self, JSON.stringify(child)], {
    stdio: "inherit",
    detached: child.detached === true,
  });
}

console.log(`up ${process.pid}`);

if (config.listen !== undefined) {
  createServer()
    .listen({ port: config.listen, host: "127.0.0.1" }, () =>
      console.log(`listening ${process.pid}`),
    )
    .on("connection", (socket) => socket.on("error", ignore));
}

if (config.exitAfterMs !== undefined) setTimeout(() => process.exit(0), config.exitAfterMs);

// 保持进程活着
setInterval(ignore, 1 << 30);
