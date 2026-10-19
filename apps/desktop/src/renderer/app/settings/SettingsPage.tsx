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
import { SECTIONS, useSettingsNavigation } from "./use-settings-navigation.ts";

export interface SettingsPageProps {
  bridge: DesktopBridge;
  api: SettingsApi;
  library: LibraryState | null;
}

// 标题留在滚动区外，分区位置由真实内容几何决定，说明换行或工具检测更新后仍能正确跳转。
export function SettingsPage({ bridge, api, library }: SettingsPageProps) {
  const t = useT();
  const { viewport, column, navigation, current, scrolled, updateSection, jump, reveal } =
    useSettingsNavigation();
  const labels = [
    t("settings.general.title"),
    t("settings.editRun.title"),
    t("settings.deps.title"),
    t("settings.runtime.title"),
    t("settings.cli.title"),
  ];
  const groups = [
    <GeneralGroup key="general" bridge={bridge} api={api} library={library} />,
    <EditRunGroup key="editRun" api={api} />,
    <DepsGroup key="deps" bridge={bridge} api={api} />,
    <RuntimeGroup key="runtime" bridge={bridge} />,
    <CliGroup key="cli" bridge={bridge} api={api} library={library} />,
  ];
  return (
    <section className={styles.root} aria-label={t("settings.page.aria")}>
      <header className={styles.header} data-settings-header="" data-scrolled={scrolled}>
        <div className={styles.headingColumn}>
          <h1 className={styles.title}>{t("settings.page.title")}</h1>
          <ScrollArea
            orientation="horizontal"
            className={styles.sectionScroll}
            viewportClassName={styles.sectionViewport}
            viewportRef={navigation}
            viewportProps={{ tabIndex: -1, "data-truncate": "" }}
          >
            <div className={styles.sections}>
              {SECTIONS.map((section, index) => (
                <button
                  type="button"
                  key={section}
                  className={styles.sectionButton}
                  aria-current={current === section ? "location" : undefined}
                  aria-controls={`settings-${section}`}
                  onClick={() => jump(section)}
                  onFocus={(event) => reveal(event.currentTarget)}
                >
                  {labels[index]}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </header>
      <ScrollArea
        className={styles.scroll}
        viewportRef={viewport}
        viewportProps={{ onScroll: updateSection, id: "settings-viewport" }}
        viewportClassName={styles.viewport}
      >
        <div ref={column} className={styles.column} data-settings-column="">
          {SECTIONS.map((section, index) => (
            <div id={`settings-${section}`} key={section} data-settings-section={section}>
              {groups[index]}
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
