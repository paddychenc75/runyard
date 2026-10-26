import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { CommandId } from "../../shared/commands.ts";
import { useContentVisible } from "./content-visibility.ts";

// 命令的“此刻能用”由界面部件自己说了算（规格 DESKTOP-EDITOR-61）：部件显示期间用 useCommand 登记
// 一条命令和它的动作，卸载或条件不成立就撤掉。命令面板只列已登记的命令，所以“只列能用的”
// 不需要一张条件表：停止运行的按钮不在，“停止运行”就没登记。
// 命令的标识符、分组和快捷键在 shared/commands.ts，菜单和命令面板共用。

export class CommandHost {
  readonly #handlers = new Map<CommandId, () => void>();
  readonly #listeners = new Set<() => void>();
  #snapshot: readonly CommandId[] = [];

  /** 登记；返回撤销函数。同一条命令后登记的盖掉先登记的，撤销只撤自己的 */
  register(id: CommandId, run: () => void): () => void {
    this.#handlers.set(id, run);
    this.#publish();
    return () => {
      if (this.#handlers.get(id) !== run) return;
      this.#handlers.delete(id);
      this.#publish();
    };
  }

  /** 现在能用的命令 */
  available(): readonly CommandId[] {
    return this.#snapshot;
  }

  /** 执行；没登记（已经不能用了）返回 false */
  run(id: CommandId): boolean {
    const handler = this.#handlers.get(id);
    if (handler === undefined) return false;
    handler();
    return true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly CommandId[] => this.#snapshot;

  #publish(): void {
    this.#snapshot = [...this.#handlers.keys()];
    for (const listener of this.#listeners) listener();
  }
}

export const CommandContext = createContext<CommandHost>(new CommandHost());

/** 外壳提供一个命令宿主；测试里也用它造 */
export function useCommandHost(): CommandHost {
  return useContext(CommandContext);
}

/** 命令此刻可用就登记它的动作（run 为 null 表示不能用）；动作随渲染更新，不用 useCallback */
export function useCommand(id: CommandId, run: (() => void) | null): void {
  useCommands({ [id]: run });
}

/** 一次登记多条命令（同一个部件管着好几条时用，免得在循环里调钩子）；值为 null 的不登记 */
export function useCommands(commands: Partial<Record<CommandId, (() => void) | null>>): void {
  const host = useCommandHost();
  const visible = useContentVisible();
  const latest = useRef(commands);
  latest.current = commands;
  // 只有“哪些命令能用”变了才重新登记，动作本身每次渲染都换也不会反复登记
  const usable = (Object.keys(commands) as CommandId[])
    .filter((id) => visible && commands[id] !== null && commands[id] !== undefined)
    .sort()
    .join(",");
  useEffect(() => {
    if (usable === "") return undefined;
    const undo = (usable.split(",") as CommandId[]).map((id) =>
      host.register(id, () => latest.current[id]?.()),
    );
    return () => {
      for (const stop of undo) stop();
    };
  }, [host, usable]);
}

/** 现在能用的命令列表（变化时重新渲染） */
export function useAvailableCommands(): readonly CommandId[] {
  const host = useCommandHost();
  return useSyncExternalStore(host.subscribe, host.getSnapshot);
}

/** 稳定的宿主引用，给只想“执行”的组件 */
export function useRunCommand(): (id: CommandId) => boolean {
  const host = useCommandHost();
  return useMemo(() => (id) => host.run(id), [host]);
}
