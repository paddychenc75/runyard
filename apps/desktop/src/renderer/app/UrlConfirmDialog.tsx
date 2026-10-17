import { T, useT } from "@runyard/i18n/react";
import { ConfirmDialog, Icon, MonogramTile, UserText } from "@runyard/ui";
import { useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { brandOf, logoOf, monogramOf, pickLocalizedText } from "../library-view.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./UrlConfirmDialog.module.css";

export interface UrlConfirmDialogProps {
  bridge: DesktopBridge;
  request: LibraryState["linkConfirm"];
  locale: LibraryState["locale"];
}

// runyard://new 链接的确认（设计稿 UrlConfirm，规格 DESKTOP-LINKS-06 至 09、13）：每次都问，
// 默认按钮是“取消”（回车和 Esc 都是取消），没有“以后信任这个来源”。是否弹出由主进程决定；
// 原生预览视图会盖住弹窗，所以打开期间告诉外壳有浮层。
export function UrlConfirmDialog({ bridge, request, locale }: UrlConfirmDialogProps) {
  const t = useT();
  // 关闭动画期间 request 已经是 null，仍显示上一次的内容，不让弹窗闪成空的
  const last = useRef(request);
  if (request !== null && request !== undefined) last.current = request;
  const open = request !== null && request !== undefined;
  useOverlay(open);
  const shown = request ?? last.current;
  if (shown === null || shown === undefined) return null;
  const templateName = pickLocalizedText(shown.template.name, locale);
  return (
    <ConfirmDialog
      open={open}
      icon="link"
      title={t("desktop.urlConfirm.title")}
      description={t("desktop.urlConfirm.from.label")}
      cancelLabel={t("desktop.urlConfirm.cancel.action")}
      confirmLabel={t("desktop.urlConfirm.confirm.action")}
      onConfirm={() => void bridge.call("link.confirm")}
      onCancel={() => void bridge.call("link.cancel")}
    >
      <dl className={styles.card} data-link-confirm="">
        <div className={styles.row}>
          <dt className={styles.key}>{t("desktop.urlConfirm.source.label")}</dt>
          <dd className={styles.value}>
            {shown.source === null ? (
              t("desktop.urlConfirm.unknown.label")
            ) : (
              <>
                <span className={styles.muted}>{t("desktop.urlConfirm.claimed.label")}</span>
                <UserText>{shown.source}</UserText>
              </>
            )}
            {shown.fromProject === null ? null : (
              <span className={styles.muted}>
                <T
                  k="desktop.urlConfirm.preview.label"
                  values={{ name: shown.fromProject }}
                  components={{ user: <UserText /> }}
                />
              </span>
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>{t("desktop.urlConfirm.template.label")}</dt>
          <dd className={styles.value}>
            <MonogramTile
              letters={monogramOf(shown.template.id)}
              logo={logoOf(shown.template.id)}
              brand={brandOf(shown.template.id)}
            />
            <UserText>{templateName}</UserText>
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>{t("desktop.urlConfirm.name.label")}</dt>
          <dd className={styles.value}>
            <UserText>{shown.name}</UserText>
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>{t("desktop.urlConfirm.folder.label")}</dt>
          <dd className={`${styles.value} ${styles.mono}`}>
            <UserText>{shown.folder}</UserText>
          </dd>
        </div>
      </dl>
      <p className={styles.warning}>
        <Icon name="warning" size={14} className={styles.warningIcon} />
        <span>{t("desktop.urlConfirm.warning.label")}</span>
      </p>
    </ConfirmDialog>
  );
}
