import type { RunKind, RunSnapshot } from "@runyard/protocol";
import type { DesktopError } from "../shared/library-state.ts";
import type { CliView } from "./cli-view.ts";
import type { LibraryClient } from "./controller-hosts.ts";
import { toDesktopError } from "./desktop-error.ts";
import { classifyStartError } from "./start-error.ts";

/** 运行类动作要用到控制器的几样东西 */
export interface RunActionsHost {
  client: LibraryClient;
  clientId: string;
  kindOf(playgroundId: string): RunKind | undefined;
  /** 正在等管理进程回应的项目（按钮暂时不可点） */
  busy: Set<string>;
  /** 启动请求失败时的错误（带缺工具的参数）；再次启动时清掉 */
  startErrors: Map<string, DesktopError>;
  /** 崩溃前截下的预览最后一帧 */
  lastFrames: Map<string, string>;
  setError(error: DesktopError | null): void;
  emit(): void;
  refresh(): Promise<void>;
}

// 启动、停止、全部停止、改为由我管理：都是“发请求、记下失败、重读”这一套
export class RunActions {
  readonly #host: RunActionsHost;
  readonly #cliView: CliView;

  constructor(host: RunActionsHost, cliView: CliView) {
    this.#host = host;
    this.#cliView = cliView;
  }

  /** 启动（或标签页里点“运行”再次启动）；持有者始终是这个项目的标签页 */
  async start(playgroundId: string): Promise<void> {
    const host = this.#host;
    host.startErrors.delete(playgroundId);
    host.lastFrames.delete(playgroundId);
    const oneshot = host.kindOf(playgroundId) === "oneshot";
    await this.#act(playgroundId, async () => {
      // 标签页持有者：这个项目在本应用里的“标签页”就是它自己，运行随本连接的生死
      const starting = host.client.call("run.start", {
        playground: playgroundId,
        owner: { kind: "tab", clientId: host.clientId, tabId: `tab-${playgroundId}` },
        // 服务等到就绪或失败：失败的错误响应带参数（缺哪个工具等）；脚本没有就绪，只看状态
        wait: oneshot ? "none" : "ready",
      });
      if (oneshot) {
        await starting;
        return;
      }
      // 不等到就绪：运行条要立刻能点“停止”；立刻就有的错误赶得上这一轮，之后的由 #settled 记下
      const settled = starting.then(
        () => this.#settled(playgroundId),
        (error: unknown) => this.#settled(playgroundId, error),
      );
      await Promise.race([settled, new Promise<void>((resolve) => setTimeout(resolve, 0))]);
    });
  }

  // 启动请求有了结果：失败的原因留给预览区的专门画面，其余错误照旧报在 error 里
  async #settled(playgroundId: string, error?: unknown): Promise<void> {
    const outcome = error === undefined ? null : classifyStartError(error);
    if (outcome?.kind === "failure") this.#host.startErrors.set(playgroundId, outcome.error);
    else if (outcome?.kind === "other") this.#host.setError(outcome.error);
    await this.#host.refresh();
  }

  async stop(playgroundId: string): Promise<void> {
    await this.#act(playgroundId, async () => {
      await this.#host.client.call("run.stop", { playground: playgroundId });
    });
  }

  /** 运行视图的“全部停止”（规格 DESKTOP-WORKSPACE-45）：标签页都还开着，显示已停止 */
  async stopAll(): Promise<void> {
    await this.#act(undefined, async () => {
      await this.#host.client.call("run.stopAll", {});
    });
  }

  /** “改为由我管理”（规格 DESKTOP-WORKSPACE-49） */
  async adopt(run: RunSnapshot): Promise<void> {
    await this.#act(run.playgroundId, () => this.#cliView.adopt(run));
  }

  async #act(busyId: string | undefined, action: () => Promise<void>): Promise<void> {
    const host = this.#host;
    if (busyId !== undefined) {
      if (host.busy.has(busyId)) return;
      host.busy.add(busyId);
    }
    host.setError(null);
    host.emit();
    try {
      await action();
    } catch (error) {
      host.setError(toDesktopError(error));
    } finally {
      if (busyId !== undefined) host.busy.delete(busyId);
    }
    await host.refresh();
  }
}
