// 用“参数数组、不经 shell、stdout/stderr 各一根管道”启动子进程，逐块记录原始字节和到达时刻。
// 与管理进程将来的做法一致（技术设计 §4.4、§4.5）：windowsHide，不继承控制台。
import { spawn, spawnSync } from "node:child_process";

export const isWin = process.platform === "win32";
const now = () => performance.timeOrigin + performance.now();

export function startCapture({ cmd, args = [], cwd, env, windowsVerbatimArguments }) {
  const t0 = now();
  const chunks = [];
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    windowsVerbatimArguments,
    detached: !isWin, // POSIX 上自成进程组，便于整组结束；只对我们自己启动的 pid 动手
  });
  let spawnError = null;
  child.on("error", (e) => {
    spawnError = e;
  });
  for (const src of ["stdout", "stderr"]) {
    child[src].on("data", (buf) => {
      const epoch = now();
      chunks.push({ t: epoch - t0, epoch, src, buf });
    });
  }
  const done = new Promise((resolve) => {
    let exit = null;
    child.on("exit", (code, signal) => {
      exit = { code, signal };
    });
    child.on("close", (code, signal) => resolve({ code, signal, ...exit, pipesClosed: true }));
    child.on("error", () => resolve({ code: null, signal: null, error: spawnError?.message }));
  });
  const handle = {
    child,
    chunks,
    startedAt: t0,
    done,
    /** 当前已收到的内容，按 UTF-8 看，供等待就绪用 */
    text: () => Buffer.concat(chunks.map((c) => c.buf)).toString("utf8"),
    async waitFor(re, timeoutMs = 90000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const m = re.exec(handle.text());
        if (m) return m;
        if (child.exitCode !== null) throw new Error(`进程已退出（${child.exitCode}），没等到 ${re}`);
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`等待 ${re} 超时 ${timeoutMs}ms`);
    },
    /** 结束整棵树。force=false 时 POSIX 先发 SIGTERM；Windows 只有强制（taskkill /T /F）。 */
    kill(force = true) {
      if (child.pid === undefined || child.exitCode !== null) return;
      if (isWin) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      else {
        try {
          process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
        } catch {}
      }
    },
    /** 结束后最多再等 graceMs 让管道排空；还没关就是有孙进程拿着管道不放。 */
    async finish(graceMs = 5000) {
      const r = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), graceMs))]);
      if (r) return r;
      handle.kill(true);
      const r2 = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), 3000))]);
      child.stdout.destroy();
      child.stderr.destroy();
      return { ...(r2 ?? { code: child.exitCode }), pipesClosed: false };
    },
  };
  return handle;
}
