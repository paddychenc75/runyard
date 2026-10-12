import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { AbsPath } from "../path-types.ts";
import type { Platform } from "../platform.ts";
import { platformError } from "../platform-error.ts";

// 启动一个与启动者脱钩的进程（管理进程，决策记录 0005）：
// 启动者退出、被强杀、终端被关，它都继续活着（证据实验 D：POSIX 上 detached 即新会话，父进程号变 1）。
// 不继承标准输入输出：输入给 /dev/null，输出追加到日志文件（600）；工作目录是状态目录；
// 配置只走命令行参数，所以不靠环境变量传——env 由调用方原样给出（要用 ELECTRON_RUN_AS_NODE 也由调用方放进去）。
// 参数是数组，不经过 shell。

const OWNER_ONLY_DIR = 0o700;

export function createSpawnDetached(stateDir: AbsPath): Platform["exec"]["spawnDetached"] {
  return async (argv, opts) => {
    const [command, ...args] = argv;
    if (command === undefined) {
      throw platformError("INTERNAL", {}, "spawnDetached needs a non-empty argv");
    }
    await fs.mkdir(stateDir, { recursive: true, mode: OWNER_ONLY_DIR });
    await fs.mkdir(dirname(opts.logFile), { recursive: true, mode: OWNER_ONLY_DIR });
    const log = await fs.open(opts.logFile, "a", 0o600);
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
        cwd: stateDir,
        env: { ...opts.env },
        // 在 POSIX 上没有效果；接口约定“隐藏窗口”，以后的实现靠它
        windowsHide: true,
      });
      const pid = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", () => resolve(child.pid as number));
      });
      // 不让启动者的事件循环等它
      child.unref();
      return { pid };
    } catch (error) {
      throw platformError(
        "INTERNAL",
        {},
        `spawnDetached failed: ${(error as NodeJS.ErrnoException).code ?? String(error)}`,
      );
    } finally {
      await log.close();
    }
  };
}
