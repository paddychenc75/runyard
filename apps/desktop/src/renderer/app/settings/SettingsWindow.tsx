import { useT } from "@runyard/i18n/react";
import { useEffect } from "react";
import { SettingsPage, type SettingsPageProps } from "./SettingsPage.tsx";
import styles from "./SettingsWindow.module.css";

/** 设置使用同一入口和文案/主题外框；不挂载项目编辑器、侧栏或标签条。 */
export function SettingsWindow(props: SettingsPageProps) {
  const t = useT();
  const title = t("settings.page.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <main className={styles.root}>
      <div className={styles.drag} aria-hidden="true" />
      <SettingsPage {...props} />
    </main>
  );
}
