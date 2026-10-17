import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { isIgnoredProjectPath } from "../../../shared/project-ignore.ts";
import { watchProject } from "../../shared/project-watch.ts";

// 项目里全部文件的清单（快速打开用，规格 DESKTOP-EDITOR-68 至 72、74）：项目标签页开着就保持最新，
// 这样按下 ⌘P 时列表已经在手边（10000 个文件也要在 200 毫秒内出列表）。
// 新建、删除、改名都会让监听报 add 或 remove，抖动一下再重读整份清单（2 秒内反映，规格 DESKTOP-EDITOR-72）。

/** 最后一次变化之后等多久再重读：一次保存或安装会连着来一串事件，合成一次读 */
export const REFRESH_DELAY_MS = 250;

export function useProjectFiles(bridge: DesktopBridge, project: string | null): readonly string[] {
  const [files, setFiles] = useState<readonly string[]>([]);
  useEffect(() => {
    setFiles([]);
    if (project === null) return undefined;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    let again = false;
    const read = async () => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      try {
        // 读不到（主进程没接线、项目刚被移走）就保持原来的清单，不打扰别的界面
        const result = await bridge.call("files.listAll", { project }).catch(() => undefined);
        if (!disposed && result?.ok === true) setFiles(result.value);
      } finally {
        reading = false;
        if (again && !disposed) {
          again = false;
          void read();
        }
      }
    };
    void read();
    const stop = watchProject(bridge, project, ({ changes }) => {
      // 只有出现或消失会改变清单；内容变了（change）不用重读，被忽略目录里的变化也不用
      if (!changes.some((c) => c.kind !== "change" && !isIgnoredProjectPath(c.path))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void read(), REFRESH_DELAY_MS);
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      stop();
    };
  }, [bridge, project]);
  return files;
}
