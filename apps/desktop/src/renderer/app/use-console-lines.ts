import { useEffect, useState } from "react";
import { type ConsoleLine, mergeConsoleLines } from "../../shared/console-state.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

/**
 * 一个项目的控制台行：先订阅推送，再取主进程留着的快照，两边靠 seq 接起来。
 * 标签页切走时组件卸载，回来重新挂载就从快照拿回之前的输出（规格 DESKTOP-WORKSPACE-17）。
 */
export function useConsoleLines(bridge: DesktopBridge, playground: string): ConsoleLine[] {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  useEffect(() => {
    let alive = true;
    // 快照之前就收到了整体替换：推送比快照新，快照不再用
    let replaced = false;
    setLines([]);
    const stop = bridge.on("console.appended", (append) => {
      if (append.playground !== playground) return;
      if (append.reset) replaced = true;
      setLines((current) => mergeConsoleLines(current, append.lines, append.reset));
    });
    void bridge.call("console.get", playground).then((snapshot) => {
      if (!alive || replaced) return;
      setLines((current) => {
        const last = snapshot.at(-1)?.seq ?? 0;
        return [...snapshot, ...current.filter((line) => line.seq > last)];
      });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [bridge, playground]);
  return lines;
}
