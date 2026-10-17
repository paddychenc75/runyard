// 应用被强制结束（kill -9）时主进程来不及通知任何人：pty-host 自己盯着启动它的进程，
// 发现它不在了（或 pid 被别的进程占用）就收尾退出，终端里的 shell 和命令随之结束（规格 DESKTOP-TERMINAL-32）。
// 进程身份是 pid 加启动时间，只看 pid 会被复用骗过。

export interface ParentWatchDeps {
  parentPid: number;
  identity(pid: number): Promise<{ startTime: number } | null>;
  /** 父进程没了；只调用一次 */
  onGone(): void;
  intervalMs: number;
}

/** 开始盯父进程；返回停止的函数 */
export async function watchParent(deps: ParentWatchDeps): Promise<() => void> {
  const origin = await deps.identity(deps.parentPid);
  if (origin === null) {
    deps.onGone();
    return () => {};
  }
  let busy = false;
  let done = false;
  const timer = setInterval(() => {
    if (busy || done) return;
    busy = true;
    void deps
      .identity(deps.parentPid)
      .then((now) => {
        if (done) return;
        if (now === null || now.startTime !== origin.startTime) {
          done = true;
          clearInterval(timer);
          deps.onGone();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, deps.intervalMs);
  return () => {
    done = true;
    clearInterval(timer);
  };
}
