import { useT } from "@runyard/i18n/react";
import { EmptyState, ScrollArea } from "@runyard/ui";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import { TemplateDetail } from "./TemplateDetail.tsx";
import { TemplateList } from "./TemplateList.tsx";
import styles from "./TemplatesPage.module.css";
import { countTemplates } from "./templates-model.ts";
import { useTemplates } from "./use-templates.ts";

export interface TemplatesPageProps {
  bridge: DesktopBridge;
  locale: LibraryState["locale"];
  /** “用它新建”：把模板标识交给新建弹窗（规格 DESKTOP-TEMPLATES-VIEW-05） */
  onCreate: (templateId: string) => void;
}

// 模板页（设计稿 Templates）：没有顶栏，左边按类型分组的列表，右边是选中模板的详情。只读：
// 没有编辑、删除、复制为自己的模板（PRD 暂不做，想改内置模板就先用它新建再另存为模板）。
export function TemplatesPage({ bridge, locale, onCreate }: TemplatesPageProps) {
  const t = useT();
  const { load, selected, select, row, detail } = useTemplates(bridge);
  const counts = load.status === "ready" ? countTemplates(load.rows) : null;
  return (
    <div className={styles.root}>
      <section className={styles.listColumn}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("desktop.templates.title")}</h1>
          {counts === null ? null : (
            <p className={styles.summary}>
              {t("desktop.templates.summary.label", {
                builtin: counts.builtin,
                user: counts.user,
              })}
            </p>
          )}
        </header>
        {load.status === "failed" ? (
          <EmptyState title={t("desktop.templates.loadFailed.hint")} />
        ) : load.status === "ready" && load.rows.length === 0 ? (
          <EmptyState title={t("desktop.templates.empty.hint")} />
        ) : load.status === "ready" ? (
          <ScrollArea className={styles.listScroll}>
            <TemplateList rows={load.rows} locale={locale} selected={selected} onSelect={select} />
          </ScrollArea>
        ) : null}
      </section>
      <aside className={styles.detailColumn} aria-label={t("desktop.templates.detail.aria")}>
        {row === undefined ? null : (
          <TemplateDetail
            row={row}
            load={detail}
            locale={locale}
            onCreate={() => onCreate(row.id)}
            onReveal={() => void bridge.call("template.reveal", { id: row.id, source: row.source })}
          />
        )}
      </aside>
    </div>
  );
}
