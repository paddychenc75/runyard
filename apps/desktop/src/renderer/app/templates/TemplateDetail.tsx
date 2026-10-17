import { useT } from "@runyard/i18n/react";
import { Badge, Button, MonogramTile, ScrollArea, UserText } from "@runyard/ui";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { TemplatePageRow } from "../../../shared/templates-view.ts";
import { brandOf, logoOf, monogramOf, pickLocalizedText } from "../../library-view.ts";
import { PathTreeView } from "./PathTreeView.tsx";
import { buildPathTree } from "./path-tree.ts";
import styles from "./TemplateDetail.module.css";
import { TemplateRequirements } from "./TemplateRequirements.tsx";
import { TemplateRun } from "./TemplateRun.tsx";
import { categoryLabel } from "./template-labels.ts";
import type { DetailLoad } from "./use-templates.ts";

export interface TemplateDetailProps {
  row: TemplatePageRow;
  load: DetailLoad;
  locale: LibraryState["locale"];
  onCreate: () => void;
  onReveal: () => void;
}

// 模板详情（设计稿 Templates 右半）：名称、标识、标签；依赖的运行环境；运行方式；包含的文件；
// 底部“用它新建”“在访达中显示”和一句怎么改内置模板的说明。没有编辑、删除、复制为自己的模板。
export function TemplateDetail({ row, load, locale, onCreate, onReveal }: TemplateDetailProps) {
  const t = useT();
  const detail = load.status === "ready" ? load.detail : null;
  return (
    <div className={styles.root}>
      <ScrollArea className={styles.scroll} viewportClassName={styles.viewport}>
        <div className={styles.content}>
          <header className={styles.header}>
            <MonogramTile
              size="xl"
              letters={monogramOf(row.id)}
              logo={row.source === "builtin" ? logoOf(row.id) : undefined}
              brand={row.source === "builtin" ? brandOf(row.id) : undefined}
            />
            <div className={styles.heading}>
              <h2 className={styles.name}>
                <UserText>{pickLocalizedText(row.name, locale)}</UserText>
              </h2>
              <UserText mono className={styles.id}>
                {row.id}
              </UserText>
            </div>
          </header>
          <div className={styles.tags}>
            <Badge>
              {row.source === "builtin"
                ? t("desktop.templates.sourceBuiltin.label")
                : t("desktop.templates.sourceUser.label")}
            </Badge>
            {row.source === "builtin" ? <Badge>{categoryLabel(t, row.category)}</Badge> : null}
            {row.unmaintained ? <Badge>{t("desktop.templates.unmaintained.label")}</Badge> : null}
            {row.valid ? null : <Badge>{t("desktop.templates.invalid.label")}</Badge>}
          </div>
          {detail === null ? (
            <p className={styles.note}>
              {load.status === "gone" ? t("desktop.templates.detailGone.hint") : null}
            </p>
          ) : (
            <>
              <TemplateRequirements tools={detail.tools} />
              {detail.run === null ? null : <TemplateRun run={detail.run} />}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{t("desktop.templates.files.title")}</h3>
                {detail.files.length === 0 ? (
                  <p className={styles.note}>{t("desktop.templates.filesEmpty.hint")}</p>
                ) : (
                  <PathTreeView nodes={buildPathTree(detail.files)} />
                )}
              </section>
            </>
          )}
        </div>
      </ScrollArea>
      <footer className={styles.footer}>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" disabled={!row.valid} onClick={onCreate}>
            {t("desktop.templates.create.action")}
          </Button>
          <Button size="lg" disabled={detail === null} onClick={onReveal}>
            {t("library.row.reveal.action")}
          </Button>
        </div>
        <p className={styles.hint}>{t("desktop.templates.edit.hint")}</p>
      </footer>
    </div>
  );
}
