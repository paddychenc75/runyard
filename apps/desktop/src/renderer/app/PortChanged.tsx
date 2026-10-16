import { useT } from "@runyard/i18n/react";
import { Banner, Button } from "@runyard/ui";
import type { TabPortFallback } from "../../shared/library-state.ts";

export interface PortChangedProps {
  fallback: TabPortFallback;
  onDismiss: () => void;
}

// 预览区上方的端口说明（设计稿 StartFailed 的“端口被占用”，规格 DESKTOP-WORKSPACE-22）：
// 不是失败，项目已经在新端口上运行；写明原端口被谁占用（查不到占用者就不写）和现在用的端口。
export function PortChanged({ fallback, onDismiss }: PortChangedProps) {
  const t = useT();
  const { occupant } = fallback;
  return (
    <Banner
      title={t("desktop.port.title", {
        wanted: String(fallback.wanted),
        reason: fallback.reason,
      })}
      description={t("desktop.port.body.label", { actual: String(fallback.actual) })}
      actions={
        <Button variant="primary" onClick={onDismiss}>
          {t("desktop.port.dismiss.action")}
        </Button>
      }
      data-port-changed=""
    >
      {occupant === null ? null : (
        <span>
          {t("desktop.port.occupant.label", { name: occupant.name, pid: String(occupant.pid) })}
        </span>
      )}
      <span>{t("desktop.port.untouched.label")}</span>
    </Banner>
  );
}
