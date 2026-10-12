// 测试用的“启动者”：调用 platform.exec.spawnDetached 后自己立刻退出，用来验证子进程与它脱钩。
// 用法：node detached-launcher.ts <home> <logFile> <command> [args...]
// 把环境变量 LAUNCHER_ENV_JSON（JSON 对象）作为给子进程的环境；输出一行：子进程的 pid。
// 设了 LAUNCHER_STAY 时不退出，留给测试去强杀它所在的进程组。
import { getPlatform } from "../get-platform.ts";
import type { AbsPath } from "../path-types.ts";

const [home, logFile, ...argv] = process.argv.slice(2) as [AbsPath, AbsPath, ...string[]];
const env = JSON.parse(process.env.LAUNCHER_ENV_JSON ?? "{}") as Record<string, string>;
const platform = getPlatform({ home, profile: undefined });
const { pid } = await platform.exec.spawnDetached(argv, { env, logFile });
process.stdout.write(`${pid}\n`);
if (process.env.LAUNCHER_STAY !== undefined) setInterval(() => {}, 1000);
