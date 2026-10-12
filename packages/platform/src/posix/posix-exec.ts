import { spawn as nodeSpawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { absPath } from "../path-types.ts";
import type { ManagedProcess, Platform } from "../platform.ts";
import { platformError } from "../platform-error.ts";
import type { ProcessSource } from "./process-source.ts";

// exec 的 POSIX 实现（决策记录 0006）。

/** 管理进程若由 Electron 拉起会带着它；漏删会让用户项目里的 Electron 程序变成 Node（RUN-LIFECYCLE-25） */
const STRIPPED_ENV = ["ELECTRON_RUN_AS_NODE"];

async function isExecutableFile(file: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function createPosixExec(source: ProcessSource): Pick<Platform["exec"], "which" | "spawn"> {
  return {
    async which(name, env, cwd) {
      if (name === "") return null;
      // 带目录的名字不查 PATH，直接按 cwd 解析
      if (name.includes("/")) {
        const file = resolve(cwd, name);
        return (await isExecutableFile(file)) ? absPath(file) : null;
      }
      // 只查 env 里的 PATH，不读本进程的 PATH；空项和相对项忽略（相对项会让结果随 cwd 变）
      for (const dir of (env.PATH ?? "").split(delimiter)) {
        if (!isAbsolute(dir)) continue;
        const file = join(dir, name);
        if (await isExecutableFile(file)) return absPath(file);
      }
      return null;
    },

    spawn(spec): ManagedProcess {
      const [command, ...args] = spec.argv;
      if (command === undefined || command === "") {
        throw platformError("INTERNAL", {}, "exec.spawn needs a non-empty argv");
      }
      const env = { ...spec.env };
      for (const key of STRIPPED_ENV) delete env[key];

      // 参数数组，不经 shell。detached 让 Node 在子进程里调 setsid：
      // 自成会话和进程组，组号等于它的 pid，proc.terminate 靠这个整组停止
      const child = nodeSpawn(command, args, {
        cwd: spec.cwd,
        env,
        shell: false,
        detached: true,
        stdio: [spec.stdin ? "pipe" : "ignore", "pipe", "pipe"],
      });
      const pid = child.pid;
      if (pid === undefined) {
        // 命令不存在、cwd 不存在等：Node 在下一个 tick 才发 error，先接住，免得变成未捕获异常
        child.once("error", () => {});
        throw platformError(
          "INTERNAL",
          {},
          `cannot start ${command}: spawn failed before a pid was assigned`,
        );
      }

      const { stdout, stderr } = child;
      if (!stdout || !stderr) throw platformError("INTERNAL", {}, "stdout or stderr pipe missing");

      // 启动时间必须同步取到：ManagedProcess.ref 是同步返回的。macOS 上这次同步调用约 3 毫秒。
      // 取不到说明进程已经退出并被回收；用 0（比任何启动时间都早）占位：
      // 此时 terminate 只会去清理仍在这个组里的后代，不会碰到别的东西
      const startTime = source.startTimeSync(pid) ?? 0;

      const exited = new Promise<{ exitCode: number | null }>((done) => {
        child.once("exit", (code) => done({ exitCode: code }));
        child.once("error", () => done({ exitCode: null }));
      });
      return {
        ref: { pid, startTime },
        stdin: child.stdin,
        stdout,
        stderr,
        exited,
      };
    },
  };
}
