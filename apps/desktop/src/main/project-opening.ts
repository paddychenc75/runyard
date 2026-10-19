import type { RunSnapshot } from "@runyard/protocol";
import { isActiveRun, latestRunByPlayground } from "./build-library-state.ts";
import { type CliView, heldByCli } from "./cli-view.ts";
import type { ConsoleLogs } from "./console-logs.ts";
import type { RestorePlan } from "./session-tracker.ts";
import { LIBRARY_TAB, type WorkspaceTabs } from "./workspace-tabs.ts";

export interface LibraryReveal {
  id: string;
  sequence: number;
}
interface OpeningHost {
  present(id: string): Promise<boolean>;
  markOpened(id: string): Promise<unknown>;
  workspace: WorkspaceTabs;
  show(): void;
  runs(): readonly RunSnapshot[];
  cliView: CliView;
  console: ConsoleLogs;
  start(id: string): Promise<void>;
}

/** 普通打开和“打开但不运行”共用路径守卫；会话恢复另走恢复流程，保留缺失标签说明。 */
export class ProjectOpening {
  readonly #host: OpeningHost;
  #sequence = 0;
  #navigation = 0;
  reveal: LibraryReveal | undefined;
  constructor(host: OpeningHost) {
    this.#host = host;
  }
  /** 新导航取消旧打开请求的界面落点；目录检查仍会完成并更新资源库。 */
  beginNavigation(): number {
    this.reveal = undefined;
    return ++this.#navigation;
  }
  async open(id: string, withoutRun = false): Promise<void> {
    const navigation = this.beginNavigation();
    const host = this.#host;
    const present = await host.present(id);
    if (navigation !== this.#navigation) return;
    if (!present) {
      this.reveal = { id, sequence: ++this.#sequence };
      host.workspace.select(LIBRARY_TAB);
      host.show();
      return;
    }
    const run = latestRunByPlayground(host.runs()).get(id);
    if (withoutRun && run !== undefined && isActiveRun(run.state)) return this.open(id);
    await host.markOpened(id);
    if (navigation !== this.#navigation) return;
    const isNew = host.workspace.open(id);
    host.show();
    if (!isNew) return;
    await host.console.watch(id);
    if (withoutRun) return;
    if (heldByCli(id, host.runs()) !== null) {
      await host.cliView.sync(host.workspace.tabs, host.runs());
      return;
    }
    await host.start(id);
  }
  async restore(plan: RestorePlan, pending: Set<string>): Promise<void> {
    for (const id of plan.tabs) {
      this.#host.workspace.open(id);
      await this.#host.console.watch(id);
    }
    this.#host.workspace.select(plan.active);
    for (const id of plan.pending) pending.add(id);
    await this.#host.cliView.sync(this.#host.workspace.tabs, this.#host.runs());
    await this.startPending(this.#host.workspace.active, pending);
  }
  async startPending(id: string, pending: Set<string>): Promise<void> {
    if (!pending.delete(id) || !(await this.#host.present(id))) return;
    const run = latestRunByPlayground(this.#host.runs()).get(id);
    if (run === undefined || !isActiveRun(run.state)) await this.#host.start(id);
  }
}
