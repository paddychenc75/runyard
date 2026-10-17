import { useT } from "@runyard/i18n/react";
import { ConfirmDialog } from "@runyard/ui";
import { useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";

export interface CloseConfirmDialogProps {
  bridge: DesktopBridge;
  request: LibraryState["closeRequest"];
}

// 关闭运行中的标签页前的确认（设计稿 CloseConfirm，规格 DESKTOP-WORKSPACE-04 至 08）。
// 是否弹出由主进程决定，界面只显示 closeRequest（含终端里在运行的命令）。原生预览视图会盖住弹窗，
// 所以打开期间要告诉外壳有浮层（useOverlay），预览区据此换成截图。
export function CloseConfirmDialog({ bridge, request }: CloseConfirmDialogProps) {
  const t = useT();
  // 关闭动画期间 request 已经是 null，仍要显示上一次的名字，不让标题闪成空的
  const last = useRef(request);
  if (request !== null) last.current = request;
  useOverlay(request !== null);
  const shown = request ?? last.current;
  if (shown === null) return null;
  // 终端里有命令在运行（规格 DESKTOP-TERMINAL-29）：写明命令名；运行也会停时两句话合在同一个确认里；
  // 只有终端里的命令会被结束时没有“不再提示”（它只管运行那一句），按钮是“关闭”
  const command = shown.terminalCommand;
  const stopsRun = command === undefined || shown.stopsRun !== false;
  return (
    <ConfirmDialog
      open={request !== null}
      icon="stop"
      title={
        stopsRun
          ? t("workspace.closeConfirm.title", { name: shown.name })
          : t("workspace.closeConfirm.terminal.title", { name: shown.name })
      }
      description={
        command === undefined
          ? t("workspace.closeConfirm.body")
          : t("workspace.closeConfirm.terminal.body", {
              stopsRun: stopsRun ? "yes" : "no",
              command,
            })
      }
      cancelLabel={t("workspace.closeConfirm.cancel.action")}
      confirmLabel={
        stopsRun
          ? t("workspace.closeConfirm.confirm.action")
          : t("workspace.closeConfirm.close.action")
      }
      optOut={
        stopsRun
          ? {
              label: t("workspace.closeConfirm.optOut.label"),
              hint: t("workspace.closeConfirm.optOut.hint"),
            }
          : undefined
      }
      onConfirm={(dontAskAgain) =>
        void bridge.call("tab.closeConfirm", { id: shown.id, dontAskAgain })
      }
      onCancel={() => void bridge.call("tab.closeCancel")}
    />
  );
}
