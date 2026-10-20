import { useT } from "@runyard/i18n/react";
import {
  IconButton,
  ScrollArea,
  SlidingIndicator,
  Tooltip,
  Truncate,
  UserText,
  useSlidingIndicator,
} from "@runyard/ui";
import styles from "./FileTabs.module.css";
import type { FileTab } from "./file-tab.ts";
import { isDirty } from "./file-tab.ts";
import { baseName } from "./path-names.ts";
import { useFileTabScroll } from "./use-file-tab-scroll.ts";

export interface FileTabsProps {
  tabs: readonly FileTab[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

// 编辑器顶上的文件标签条（设计稿 WebLight：选中的有底色，每个标签后面一个关闭钮）。
// 未保存的标签名后面有一个点（设计稿没有这个状态）。
export function FileTabs({ tabs, active, onSelect, onClose }: FileTabsProps) {
  const t = useT();
  const viewport = useFileTabScroll(active);
  const slide = useSlidingIndicator<HTMLDivElement>(active);
  const names = tabs.map((tab) => baseName(tab.path));
  return (
    <ScrollArea
      orientation="horizontal"
      scrollbarVisibility="hidden"
      viewportRef={viewport}
      className={styles.root}
      viewportProps={{ role: "tablist", "aria-label": t("desktop.editor.tabs.aria") }}
    >
      <div ref={slide.container} className={styles.strip}>
        <SlidingIndicator indicatorRef={slide.indicator} className={styles.indicator} />
        {tabs.map((tab, index) => {
          const name = names[index] ?? tab.path;
          const dirty = isDirty(tab);
          const selected = tab.path === active;
          return (
            <div
              key={tab.path}
              className={styles.item}
              data-file-tab=""
              data-selected={selected ? "" : undefined}
            >
              <Tooltip content={<UserText>{tab.path}</UserText>}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={
                    tab.deleted
                      ? t("desktop.editor.tabDeleted.label", { name })
                      : dirty
                        ? t("desktop.editor.tabUnsaved.label", { name })
                        : undefined
                  }
                  data-path={tab.path}
                  className={styles.tab}
                  onClick={() => onSelect(tab.path)}
                >
                  <Truncate className={styles.name}>
                    <UserText>{name}</UserText>
                  </Truncate>
                  {tab.deleted ? (
                    <span aria-hidden="true" className={styles.deleted}>
                      {t("desktop.editor.tabDeletedMark.label")}
                    </span>
                  ) : dirty ? (
                    <span aria-hidden="true" className={styles.dirty} data-dirty="" />
                  ) : null}
                </button>
              </Tooltip>
              <IconButton
                icon="close"
                size="xs"
                label={t("desktop.editor.tabClose.label", { name })}
                onClick={() => onClose(tab.path)}
              />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
