import type { RequestResult, RequestSpec, RunSnapshot } from "@runyard/protocol";
import { previewUrlFor } from "./build-library-state.ts";
import type { ConsoleLogs } from "./console-logs.ts";
import type { LibraryClient, PreviewHost, SystemActions } from "./controller-hosts.ts";
import { isLocalPreviewUrl } from "./preview-policy.ts";

// 运行条、脚本输出区和预览地址栏上的动作（#223、#220、#247）：重启、给脚本的输入、
// 脚本“保存后自动运行”开关、清除输出、刷新预览、在浏览器中打开、开发者工具。
// 控制器把自己的“忙”标记和重读数据交进来，这里不碰控制器的私有状态。

export interface RunBarHooks {
  client: LibraryClient;
  preview: PreviewHost;
  system: SystemActions;
  console: ConsoleLogs;
  runs: () => readonly RunSnapshot[];
  /** 带“忙”标记执行一个动作：按钮在等待期间不可点，失败记进全局错误，结束后重读 */
  act: (playgroundId: string, action: () => Promise<void>) => Promise<void>;
}

export class RunBarActions {
  readonly #hooks: RunBarHooks;

  constructor(hooks: RunBarHooks) {
    this.#hooks = hooks;
  }

  /** 重启（规格 DESKTOP-WORKSPACE-27）：管理进程先停止再启动，端口不变，持有者不变 */
  restart(playgroundId: string): Promise<void> {
    return this.#hooks.act(playgroundId, async () => {
      await this.#hooks.client.call("run.restart", { playground: playgroundId });
    });
  }

  /** 输入行回车（规格 DESKTOP-WORKSPACE-37）：只有运行中的脚本收；原样加换行写给标准输入 */
  async sendInput(playgroundId: string, line: string): Promise<void> {
    const latest = this.#latest(playgroundId);
    if (latest === undefined || latest.kind !== "oneshot" || latest.state !== "running") return;
    await this.#hooks.client.call("run.stdin", { runId: latest.runId, data: `${line}\n` });
  }

  /** 这个项目自己的“保存后自动运行”开关（规格 DESKTOP-WORKSPACE-34）；全局开关在设置里 */
  setScriptAutoRun(playgroundId: string, enabled: boolean): Promise<void> {
    return this.#hooks.act(playgroundId, async () => {
      await this.#hooks.client.call("playground.update", {
        playground: playgroundId,
        scriptAutoRun: enabled,
      });
    });
  }

  /** 控制台的“清除”（规格 DESKTOP-WORKSPACE-42）：管理进程里这次运行已记的输出和界面手里的都清掉 */
  async clearConsole(playgroundId: string): Promise<void> {
    await this.#hooks.client.call("logs.clear", { playground: playgroundId });
    this.#hooks.console.clear(playgroundId);
  }

  /**
   * 请求面板发请求（规格 DESKTOP-REQUEST-PANEL-02）：转给管理进程，目标由它按运行的端口定，
   * 这里只给路径。管理进程连不上等协议错误折成“断开”，不抛给界面
   */
  async sendRequest(playgroundId: string, request: RequestSpec): Promise<RequestResult> {
    try {
      return (await this.#hooks.client.call("request.send", {
        playground: playgroundId,
        request,
      })) as RequestResult;
    } catch {
      return { outcome: "failed", reason: "disconnected", durationMs: 0 };
    }
  }

  /** 请求面板的“服务重载后自动重发”开关（规格 DESKTOP-REQUEST-PANEL-15）：存进项目，重开标签页、重启应用都在 */
  setRequestAutoResend(playgroundId: string, enabled: boolean): Promise<void> {
    return this.#hooks.act(playgroundId, async () => {
      await this.#hooks.client.call("playground.update", {
        playground: playgroundId,
        requestAutoResend: enabled,
      });
    });
  }

  async lastRequest(playgroundId: string): Promise<RequestSpec | null> {
    try {
      return (await this.#hooks.client.call("request.getLast", {
        playground: playgroundId,
      })) as RequestSpec | null;
    } catch {
      return null;
    }
  }

  /** 请求面板的“在浏览器中打开”（规格 DESKTOP-REQUEST-PANEL-12）：地址由运行的端口拼，路径必须以 / 开头 */
  openRequestInBrowser(playgroundId: string, path: string): void {
    const base = previewUrlFor(playgroundId, this.#hooks.runs());
    if (base === null || !path.startsWith("/")) return;
    const { port } = new URL(base);
    const url = `http://127.0.0.1:${port}${path}`;
    // 路径里的字符再怎么写也不能改变主机和端口：解析后对不上就不打开
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1" || parsed.port !== port) return;
    } catch {
      return;
    }
    this.#hooks.system.openExternal(url);
  }

  reloadPreview(playgroundId: string): void {
    this.#hooks.preview.reload(playgroundId);
  }

  /** 用系统默认浏览器打开预览此刻的地址；预览里点进别的页面后就是那个页面（规格 DESKTOP-WORKSPACE-32） */
  openPreviewInBrowser(playgroundId: string): void {
    const shown = this.#hooks.preview.currentUrl(playgroundId);
    const url =
      shown !== undefined && isLocalPreviewUrl(shown)
        ? shown
        : previewUrlFor(playgroundId, this.#hooks.runs());
    if (url !== null) this.#hooks.system.openExternal(url);
  }

  openPreviewDevTools(playgroundId: string): void {
    this.#hooks.preview.openDevTools(playgroundId);
  }

  #latest(playgroundId: string): RunSnapshot | undefined {
    let latest: RunSnapshot | undefined;
    for (const run of this.#hooks.runs()) {
      if (run.playgroundId !== playgroundId) continue;
      if (latest === undefined || run.startedAt > latest.startedAt) latest = run;
    }
    return latest;
  }
}
