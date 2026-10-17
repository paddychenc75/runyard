import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { FilesChanged } from "../../shared/editor-files.ts";

// 项目文件夹的监听是主进程里每个项目一份、不计数的：文件树和编辑会话都要它，
// 谁先关就会把另一个的监听也停掉。所以在界面一侧数着，最后一个用完才真的 unwatch。
const holders = new WeakMap<DesktopBridge, Map<string, number>>();

/** 订阅一个项目的文件变化（同时保证监听开着）；返回取消订阅的函数 */
export function watchProject(
  bridge: DesktopBridge,
  project: string,
  listener: (payload: FilesChanged) => void,
): () => void {
  let counts = holders.get(bridge);
  if (counts === undefined) {
    counts = new Map();
    holders.set(bridge, counts);
  }
  const map = counts;
  const stop = bridge.on("files.changed", (payload) => {
    if (payload.project === project) listener(payload);
  });
  const before = map.get(project) ?? 0;
  map.set(project, before + 1);
  // 重复 watch 没有副作用，所以每个持有者都调一次最稳（上一个持有者的 watch 可能还没完成）
  void bridge.call("files.watch", { project });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stop();
    const left = (map.get(project) ?? 1) - 1;
    if (left > 0) map.set(project, left);
    else {
      map.delete(project);
      void bridge.call("files.unwatch", { project });
    }
  };
}
