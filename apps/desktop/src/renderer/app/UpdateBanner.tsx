import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { UpdateBannerView } from "../../shared/library-state.ts";
import styles from "./UpdateBanner.module.css";

export interface UpdateBannerProps {
  bridge: DesktopBridge;
  update: UpdateBannerView | null | undefined;
}

// 资源库页顶部的“有新版本”提示条（设计稿 UpdateBanner，规格 DESKTOP-SETTINGS-26）：
// “下载”用系统浏览器打开发布页，应用自己不下载也不更新；“以后再说”让这个版本不再提示。
export function UpdateBanner({ bridge, update }: UpdateBannerProps) {
  const t = useT();
  if (update === null || update === undefined) return null;
  return (
    <section
      className={styles.root}
      role="status"
      aria-label={t("desktop.update.region.aria")}
      data-update-banner=""
    >
      <Icon name="download" size={18} className={styles.icon} />
      <p className={styles.text}>
        {t("desktop.update.banner.label", { latest: update.latest, current: update.current })}
      </p>
      <ButtonGroup size="md" className={styles.actions}>
        <Button variant="primary" onClick={() => void bridge.call("update.download")}>
          {t("desktop.update.download.action")}
        </Button>
        <button
          type="button"
          className={styles.link}
          onClick={() => void bridge.call("update.later")}
        >
          {t("desktop.update.later.action")}
        </button>
      </ButtonGroup>
    </section>
  );
}
