import { useLocale, useT } from "@runyard/i18n/react";
import { Badge, Button, GlassSurface, UserText } from "@runyard/ui";
import { useEffect, useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { RunningRow } from "../../shared/library-state.ts";
import { pickLocalizedText } from "../library-view.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./RunningPopover.module.css";
import { useNow } from "./use-now.ts";
import { useUptime } from "./use-uptime.ts";

export interface RunningPopoverProps {
  bridge: DesktopBridge;
  runs: readonly RunningRow[];
  onClose: () => void;
}

// 运行视图（设计稿 RunningPopover，规格 DESKTOP-WORKSPACE-43 至 47）：顶栏“N 个运行中”点开的列表。
// 每个运行一行：名称、模板、端口、已运行时长、来源（标签页，或命令行加智能体名称）；“停止”只停这一个，
// “全部停止”停列表里的全部；点一行（不在按钮上）切到它的标签页，没有就打开它（查看）。
// Esc 和点弹层外都关闭。预览是原生视图，打开期间 useOverlay 让它让位（规格 47，真实窗口里看）。
export function RunningPopover({ bridge, runs, onClose }: RunningPopoverProps) {
  const t = useT();
  const locale = useLocale();
  const uptime = useUptime();
  const now = useNow(30_000);
  const root = useRef<HTMLDivElement>(null);
  useOverlay(true);
  useEffect(() => {
    root.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // 点在“N 个运行中”按钮自己身上由按钮切换，这里只管弹层之外的其他地方
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target === null || root.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-running-toggle]") !== null) return;
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);
  const view = (row: RunningRow) => {
    void bridge.call("tab.open", row.id);
    onClose();
  };
  return (
    <GlassSurface
      material="menu"
      className={styles.root}
      role="dialog"
      aria-label={t("workspace.running.aria")}
      tabIndex={-1}
      ref={root}
      data-running-popover=""
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{t("workspace.running.title")}</h2>
        <Button
          size="sm"
          className={styles.stopAll}
          disabled={runs.length === 0}
          onClick={() => void bridge.call("run.stopAll")}
        >
          {t("workspace.running.stopAll.action")}
        </Button>
      </div>
      {runs.length === 0 ? (
        <p className={styles.empty}>{t("library.topbar.idle.label")}</p>
      ) : (
        <ul className={styles.list}>
          {runs.map((row) => (
            <li key={row.runId} className={styles.row} data-run-row={row.id}>
              <button
                type="button"
                className={styles.main}
                aria-label={t("workspace.running.open.aria", { name: row.name })}
                onClick={() => view(row)}
              >
                <span aria-hidden="true" className={styles.dot} />
                <span className={styles.body}>
                  <span className={styles.line}>
                    <UserText className={styles.name}>{row.name}</UserText>
                    {row.templateName === null ? null : (
                      <UserText className={styles.template}>
                        {pickLocalizedText(row.templateName, locale)}
                      </UserText>
                    )}
                  </span>
                  <span className={styles.meta}>
                    {row.port === null ? null : <span className={styles.port}>:{row.port}</span>}
                    <span className={styles.up}>
                      {t("workspace.running.uptime.label", {
                        duration: uptime(Math.max(0, now - row.startedAt)),
                      })}
                    </span>
                    {row.source.kind === "tab" ? (
                      <Badge icon="grid">{t("workspace.running.sourceTab.label")}</Badge>
                    ) : (
                      <Badge variant="violet" icon="spark">
                        {row.source.agent === null ? (
                          t("workspace.running.sourceCliPlain.label")
                        ) : (
                          <UserText>
                            {t("workspace.running.sourceCli.label", { agent: row.source.agent })}
                          </UserText>
                        )}
                      </Badge>
                    )}
                  </span>
                  {row.source.kind === "cli" ? (
                    <span className={styles.idle}>{t("workspace.running.idle.hint")}</span>
                  ) : null}
                </span>
              </button>
              <Button
                size="sm"
                aria-label={t("workspace.running.stop.aria", { name: row.name })}
                onClick={() => void bridge.call("run.stop", row.id)}
              >
                {t("workspace.running.stop.action")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.footer}>{t("workspace.running.footer.hint")}</p>
    </GlassSurface>
  );
}
