import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { platformError } from "../platform-error.ts";
import type { ProcessSource } from "../posix/process-source.ts";
import { parseLstart, parsePsList } from "../posix/ps-parse.ts";

// macOS 没有 /proc，不用原生模块就读不到别的进程的启动时间，只能问 ps。
// 代价（负责人的 Mac 上量的）：单个进程 `ps -o lstart= -p` 约 3 毫秒；整张表 `ps -A` 约 20 毫秒（一千个进程）。
// 精度是秒：同一个 pid 在同一秒内被复用到另一个进程，在 pid 顺序分配、到 99999 才回绕的系统上不现实。
const PS = "/bin/ps";
const execFileAsync = promisify(execFile);

// ps 的输出随语言和时区变化；固定成 C 和 UTC，解析才稳定
const psEnv = () => ({ ...process.env, LC_ALL: "C", TZ: "UTC" });

export function createPsSource(): ProcessSource {
  return {
    async snapshot() {
      try {
        const { stdout } = await execFileAsync(PS, ["-A", "-o", "pid=,pgid=,lstart="], {
          env: psEnv(),
          maxBuffer: 16 * 1024 * 1024,
        });
        return parsePsList(stdout);
      } catch (error) {
        throw platformError("INTERNAL", {}, `ps -A failed: ${String(error)}`);
      }
    },
    async startTime(pid) {
      try {
        const { stdout } = await execFileAsync(PS, ["-o", "lstart=", "-p", String(pid)], {
          env: psEnv(),
        });
        return parseLstart(stdout);
      } catch {
        // pid 不存在时 ps 以 1 退出，输出为空
        return null;
      }
    },
    startTimeSync(pid) {
      try {
        return parseLstart(
          execFileSync(PS, ["-o", "lstart=", "-p", String(pid)], {
            env: psEnv(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }),
        );
      } catch {
        return null;
      }
    },
  };
}
