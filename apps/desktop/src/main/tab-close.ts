import type { RunSnapshot } from "@runyard/protocol";
import type { DesktopError } from "../shared/library-state.ts";
import { needsStopOnClose, ownedActiveRun } from "./build-library-state.ts";
import type { LibraryClient } from "./controller-hosts.ts";
import { toDesktopError } from "./desktop-error.ts";
import { readConfirmClose } from "./library-root.ts";

/** 关标签页要用到控制器的几样东西 */
export interface TabCloseHost {
  client: LibraryClient;
  hasTab(id: string): boolean;
  runs(): readonly RunSnapshot[];
  /** 去掉标签并放掉预览和控制台，不碰运行；返回有没有真的去掉 */
  dropTab(id: string): boolean;
  refresh(): Promise<void>;
  emit(): void;
  fail(error: DesktopError): void;
  /** 这个项目的终端里正在运行的命令名；空闲或没开终端是 null（规格 DESKTOP-TERMINAL-28、29） */
  terminalCommand(id: string): Promise<string | null>;
}

/**
 * 关闭项目标签（规格 DESKTOP-WORKSPACE-04、06、09、10）：只有“标签页持有、仍在进行”的运行
 * 才需要确认，而且用户没勾过“不再提示”；已停止的和命令行持有的直接关。
 */
export class TabClose {
  readonly #host: TabCloseHost;
  /** 正在等确认的标签（项目 id） */
  requestId: string | null = null;
  /** 等确认的标签页里终端在运行的命令；确认里要写出来 */
  requestTerminal: { command: string; stopsRun: boolean } | null = null;

  constructor(host: TabCloseHost) {
    this.#host = host;
  }

  async request(playgroundId: string): Promise<void> {
    const host = this.#host;
    if (!host.hasTab(playgroundId)) return;
    const command = await host.terminalCommand(playgroundId);
    const stopsRun = ownedActiveRun(playgroundId, host.runs()) !== null;
    // 终端里有命令在运行时一定确认：“不再提示”只管运行那一句（规格 DESKTOP-TERMINAL-29）
    if (command === null) {
      if (!stopsRun || !(await readConfirmClose(host.client))) {
        await this.#closeNow(playgroundId);
        return;
      }
    }
    this.requestId = playgroundId;
    this.requestTerminal = command === null ? null : { command, stopsRun };
    host.emit();
  }

  /** 确认关闭并停止；勾了“不再提示”就先记下（失败只报错，不拦着关） */
  async confirm(playgroundId: string, dontAskAgain: boolean): Promise<void> {
    if (this.requestId !== playgroundId) return;
    this.requestId = null;
    this.requestTerminal = null;
    if (dontAskAgain) {
      try {
        await this.#host.client.call("settings.set", { confirmCloseRunningTab: false });
      } catch (error) {
        this.#host.fail(toDesktopError(error));
      }
    }
    await this.#closeNow(playgroundId);
  }

  /** 取消：弹窗关掉，标签和运行都不动，勾选也不记 */
  cancel(): void {
    if (this.requestId === null) return;
    this.requestId = null;
    this.requestTerminal = null;
    this.#host.emit();
  }

  // 先把标签去掉（界面立刻响应），再停它持有的运行；停止的时限由管理进程保证（run/ownership）
  async #closeNow(playgroundId: string): Promise<void> {
    const host = this.#host;
    const owned = needsStopOnClose(playgroundId, host.runs());
    if (!host.dropTab(playgroundId)) return;
    if (owned) {
      try {
        await host.client.call("run.stop", { playground: playgroundId });
      } catch (error) {
        host.fail(toDesktopError(error));
      }
    }
    await host.refresh();
  }
}
