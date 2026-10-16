import type { Owner } from "@runyard/protocol";

/**
 * 资源库看运行的那一面。运行编排（#40）实现它，资源库方法只通过它问“谁在运行”和“请停掉”。
 * 在 #40 合并之前，装配方不提供时用 `noRuns`；测试用自己的替身。
 */
export interface RunsView {
  /** 现在有运行（含开着标签页的运行）的项目 id；clean.due 的 inUse 就是它 */
  activePlaygrounds(): ReadonlySet<string>;
  /** 项目正处于 installing 或 starting（改名要拒绝，BUSY） */
  isBusy(playgroundId: string): boolean;
  /** 项目当前运行的持有者；没有运行时 undefined */
  ownerOf(playgroundId: string): Owner | undefined;
  /**
   * 停止项目的运行，并等到进程树确实退出（含按运行标记找到的脱离进程组的后代，技术设计 §4.3 第 4 步）。
   * 没有运行时什么也不做
   */
  stop(playgroundId: string): Promise<void>;
  /** 用现有持有者重新启动项目（改名之后用）；路径由实现按 id 从资源库取，端口沿用登记的 */
  start(playgroundId: string, owner: Owner): Promise<void>;
}

export const noRuns: RunsView = {
  activePlaygrounds: () => new Set(),
  isBusy: () => false,
  ownerOf: () => undefined,
  stop: async () => {},
  start: async () => {},
};
