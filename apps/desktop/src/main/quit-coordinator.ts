// 退出流程：第一次退出请求先拦下，向管理进程道别（session.bye，它会停掉本连接名下的运行），
// 完成后再真正退出。道别期间的第二次退出请求（连按 ⌘Q）只拦下，不重复道别也不抢先退出；
// 道别完成后触发的那次退出放行。管理进程自己最多等 5 秒就返回（规格 RUN-OWNERSHIP-06），
// 但连接卡死时回复可能永远不来，所以这里再设一个上限，到点照样退出，不让 ⌘Q 失灵。
// 道别之前先问编辑器（beforeBye）：有未保存的修改先写入，自动保存关着的先问用户，选“取消”就中止这次退出（规格 DESKTOP-EDITOR-27、28）。
// Electron 的 app 以最小接口传进来，测试里换成假的。

export interface QuitHost {
  quit(): void;
}

/** 比管理进程的 5 秒多留一点余量 */
export const BYE_TIMEOUT_MS = 7000;

export class QuitCoordinator {
  private state: "idle" | "flushing" | "saying-bye" | "done" = "idle";

  private readonly host: QuitHost;
  private readonly sayBye: () => Promise<void>;
  private readonly timeoutMs: number;
  private readonly beforeBye: (() => Promise<boolean>) | undefined;

  /** beforeBye 返回 false 表示用户取消了退出；抛错、不回应都按放行处理，不让 ⌘Q 失灵 */
  constructor(
    host: QuitHost,
    sayBye: () => Promise<void>,
    timeoutMs = BYE_TIMEOUT_MS,
    beforeBye?: () => Promise<boolean>,
  ) {
    this.host = host;
    this.sayBye = sayBye;
    this.timeoutMs = timeoutMs;
    this.beforeBye = beforeBye;
  }

  /** 放在 before-quit 里；返回 true 表示应当 preventDefault */
  handleBeforeQuit(): boolean {
    if (this.state === "done") return false;
    if (this.state !== "idle") return true;
    if (this.beforeBye === undefined) {
      this.startBye();
      return true;
    }
    this.state = "flushing";
    void this.beforeBye()
      .catch(() => true)
      .then((proceed) => {
        if (proceed) this.startBye();
        else this.state = "idle";
      });
    return true;
  }

  private startBye(): void {
    this.state = "saying-bye";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.timeoutMs);
    });
    void Promise.race([this.sayBye().catch(() => undefined), timedOut]).then(() => {
      clearTimeout(timer);
      this.state = "done";
      this.host.quit();
    });
  }
}

export interface QuitFlowApp extends QuitHost {
  on(event: "before-quit", listener: (event: { preventDefault(): void }) => void): void;
}

/** 把退出流程接到应用的 before-quit 上；要在关窗口拦截（window-lifecycle）之后登记 */
export function registerQuitFlow(
  app: QuitFlowApp,
  sayBye: () => Promise<void>,
  beforeBye?: () => Promise<boolean>,
): QuitCoordinator {
  const coordinator = new QuitCoordinator(app, sayBye, BYE_TIMEOUT_MS, beforeBye);
  app.on("before-quit", (event) => {
    if (coordinator.handleBeforeQuit()) event.preventDefault();
  });
  return coordinator;
}
