import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { vueServiceUsable } from "./format-support.ts";

/** 这个项目的 Vue 语言服务此刻能不能用（命令面板里“格式化文档”据此登记或撤掉） */
export function useVueUsable(bridge: DesktopBridge, project: string): boolean {
  const [usable, setUsable] = useState(true);
  useEffect(
    () =>
      bridge.on("vue.status", (event) => {
        if (event.project === project) setUsable(vueServiceUsable(event.state));
      }),
    [bridge, project],
  );
  return usable;
}
