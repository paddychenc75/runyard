import { useT } from "@runyard/i18n/react";
import { Button, type ButtonProps } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { runActionOf } from "./run-view.ts";

export interface RunActionButtonProps {
  bridge: DesktopBridge;
  tab: TabRow;
  size?: ButtonProps["size"];
}

// 停止 / 运行 / 重新运行：运行条、脚本输出头部、预览区的“已停止”画面共用同一个判断。
// 手动停止后标签页保持打开，点“运行”再次启动，持有者仍是这个标签页（规格 DESKTOP-WORKSPACE-11、12）。
export function RunActionButton({ bridge, tab, size }: RunActionButtonProps) {
  const t = useT();
  const action = runActionOf(tab);
  return (
    <Button
      variant={action === "stop" ? "neutral" : "primary"}
      size={size ?? "md"}
      icon={action === "stop" ? "stop" : action === "recheck" ? "refresh" : "play"}
      // 找不到文件夹的项目没有东西可运行（主进程也不会启动它）
      disabled={tab.busy || tab.missing === true}
      onClick={() => void bridge.call(action === "stop" ? "run.stop" : "run.start", tab.id)}
    >
      {action === "stop"
        ? t("desktop.stop.action")
        : action === "run"
          ? t("desktop.run.action")
          : action === "recheck"
            ? t("desktop.missing.recheck.action")
            : t("desktop.rerun.action")}
    </Button>
  );
}
