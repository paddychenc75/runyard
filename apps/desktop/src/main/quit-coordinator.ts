// 退出流程：第一次退出请求先拦下，向管理进程道别（session.bye，它会停掉本连接名下的运行），
// 完成后再真正退出。道别期间的第二次退出请求（连按 ⌘Q）只拦下，不重复道别也不抢先退出；
// 道别完成后触发的那次退出放行。Electron 的 app 以最小接口传进来，测试里换成假的。

export interface QuitHost {
  quit(): void;
}

export class QuitCoordinator {
  private state: "idle" | "saying-bye" | "done" = "idle";

  private readonly host: QuitHost;
  private readonly sayBye: () => Promise<void>;

  constructor(host: QuitHost, sayBye: () => Promise<void>) {
    this.host = host;
    this.sayBye = sayBye;
  }

  /** 放在 before-quit 里；返回 true 表示应当 preventDefault */
  handleBeforeQuit(): boolean {
    if (this.state === "done") return false;
    if (this.state === "saying-bye") return true;
    this.state = "saying-bye";
    void this.sayBye()
      .catch(() => undefined)
      .finally(() => {
        this.state = "done";
        this.host.quit();
      });
    return true;
  }
}
