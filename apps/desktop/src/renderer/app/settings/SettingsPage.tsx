import { useT } from "@runyard/i18n/react";
import { ScrollArea } from "@runyard/ui";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { CliGroup } from "./CliGroup.tsx";
import { DepsGroup } from "./DepsGroup.tsx";
import { EditRunGroup } from "./EditRunGroup.tsx";
import { GeneralGroup } from "./GeneralGroup.tsx";
import { RuntimeGroup } from "./RuntimeGroup.tsx";
import styles from "./SettingsPage.module.css";

export interface SettingsPageProps {
  bridge: DesktopBridge;
  api: SettingsApi;
  library: LibraryState | null;
}

// 设置页（设计稿 Settings，规格 DESKTOP-SETTINGS-01）：主窗口里的一页，没有顶栏；分两列、五组。
// 五组都在：通用、编辑与运行（#188），依赖与网络、运行环境（#189），命令行与智能体（#195）。
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
          <DepsGroup bridge={bridge} api={api} />
        </div>
        <div className={styles.column}>
          <RuntimeGroup bridge={bridge} />
          <CliGroup bridge={bridge} api={api} library={library} />
        </div>
      </div>
    </ScrollArea>
  );
}
