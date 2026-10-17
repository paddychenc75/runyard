import { useT } from "@runyard/i18n/react";
import { ScrollArea } from "@runyard/ui";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { CliGroup } from "./CliGroup.tsx";
import { EditRunGroup } from "./EditRunGroup.tsx";
import { GeneralGroup } from "./GeneralGroup.tsx";
import { PendingGroup } from "./PendingGroup.tsx";
import styles from "./SettingsPage.module.css";

export interface SettingsPageProps {
  bridge: DesktopBridge;
  api: SettingsApi;
  library: LibraryState | null;
}

// 设置页（设计稿 Settings，规格 DESKTOP-SETTINGS-01）：主窗口里的一页，没有顶栏；分两列、五组。
// 通用、编辑与运行、内置模板免确认这一期做；依赖与网络、运行环境随 #189，命令行与智能体的其余项随 #195。
export function SettingsPage({ bridge, api, library }: SettingsPageProps) {
  const t = useT();
  return (
    <ScrollArea
      role="region"
      className={styles.root}
      viewportClassName={styles.viewport}
      aria-label={t("settings.page.aria")}
    >
      <h1 className={styles.title}>{t("settings.page.title")}</h1>
      <div className={styles.columns}>
        <div className={styles.column}>
          <GeneralGroup bridge={bridge} api={api} library={library} />
          <EditRunGroup api={api} />
          <PendingGroup title={t("settings.deps.title")} note={t("settings.pending.deps.label")} />
        </div>
        <div className={styles.column}>
          <PendingGroup
            title={t("settings.runtime.title")}
            note={t("settings.pending.runtime.label")}
          />
          <CliGroup api={api} />
        </div>
      </div>
    </ScrollArea>
  );
}
