import { useT } from "@runyard/i18n/react";
import { Button, ScrollArea, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { buildLibraryView } from "../library-view.ts";
import styles from "./DevLibraryPanel.module.css";

export interface DevLibraryPanelProps {
  bridge: DesktopBridge;
  library: LibraryState | null;
}

// 开发期的朴素列表：页标题和概况、项目列表（运行、停止、选中显示预览）、用内置模板新建。
// 它让负责人已经能做的事（新建、运行、停止、看预览）在新外壳里仍然够得着；
// 资源库列表（#169）、新建对话框（#175）、标签页（#170）做好后整块删掉。
export function DevLibraryPanel({ bridge, library }: DevLibraryPanelProps) {
  const t = useT();
  const running = library?.playgrounds.filter((row) => row.active).length ?? 0;
  const view = library === null ? null : buildLibraryView(library);
  return (
    <ScrollArea className={styles.root}>
      <div className={styles.body}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("library.filter.all.label")}</h1>
          <p className={styles.summary}>
            {t("library.page.summary.label", { total: library?.playgrounds.length ?? 0, running })}
          </p>
        </header>
        {view === null ? null : (
          <>
            {view.errorText === null ? null : <p className={styles.error}>{view.errorText}</p>}
            {view.emptyHint === null ? null : <p className={styles.hint}>{view.emptyHint}</p>}
            <ul className={styles.rows}>
              {view.rows.map((row) => (
                <li
                  key={row.id}
                  className={styles.row}
                  data-playground={row.id}
                  data-previewing={row.previewing ? "" : undefined}
                >
                  <button
                    type="button"
                    className={styles.name}
                    onClick={() => void bridge.call("preview.select", row.id)}
                  >
                    <UserText>{row.name}</UserText>
                  </button>
                  <span className={styles.state}>{row.stateLabel}</span>
                  <Button
                    size="sm"
                    disabled={row.busy}
                    onClick={() =>
                      void bridge.call(row.action === "run" ? "run.start" : "run.stop", row.id)
                    }
                  >
                    {row.actionLabel}
                  </Button>
                </li>
              ))}
            </ul>
            <h2 className={styles.section}>{view.createHeading}</h2>
            <div className={styles.templates}>
              {view.templates.map((template) => (
                <Button
                  key={template.id}
                  size="sm"
                  icon="plus"
                  onClick={() => void bridge.call("playground.create", template.id)}
                >
                  <UserText>{template.label}</UserText>
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
