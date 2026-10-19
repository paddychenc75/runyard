import { useT } from "@runyard/i18n/react";
import { Badge, MonogramTile, Truncate, UserText } from "@runyard/ui";
import type { KeyboardEvent } from "react";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { TemplatePageRow } from "../../../shared/templates-view.ts";
import { brandOf, logoOf, monogramOf, pickLocalizedText } from "../../library-view.ts";
import styles from "./TemplateList.module.css";
import { categoryLabel, problemLabel } from "./template-labels.ts";
import { groupTemplates } from "./templates-model.ts";

export interface TemplateListProps {
  rows: readonly TemplatePageRow[];
  locale: LibraryState["locale"];
  selected: string | null;
  onSelect: (key: string) => void;
}

// 按类型分组的模板列表（设计稿 Templates 左半）：图标、名称、一句说明，右侧标“内置”或“我的”。
// 无效的用户模板也在，说明那一行换成无效原因（规格 DESKTOP-TEMPLATES-VIEW-02）。
export function TemplateList({ rows, locale, selected, onSelect }: TemplateListProps) {
  const t = useT();
  const groups = groupTemplates(rows);
  const order = groups.flatMap((group) => group.rows.map((row) => row.key));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = selected === null ? -1 : order.indexOf(selected);
    const next = order[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next !== undefined) onSelect(next);
  }

  return (
    <div
      role="listbox"
      aria-label={t("desktop.templates.list.aria")}
      tabIndex={0}
      className={styles.root}
      onKeyDown={onKeyDown}
    >
      {groups.map((group) => (
        // biome-ignore lint/a11y/useSemanticElements: #291 列表框里的分组没有对应的原生元素（fieldset 是表单控件的分组）
        <div
          key={group.category}
          role="group"
          aria-label={categoryLabel(t, group.category)}
          className={styles.group}
        >
          <div className={styles.groupTitle} aria-hidden="true">
            {categoryLabel(t, group.category)}
          </div>
          {group.rows.map((row) => {
            const active = row.key === selected;
            return (
              // biome-ignore lint/a11y/useFocusableInteractive: 焦点在外层列表框上，方向键换选项
              <div
                key={row.key}
                role="option"
                aria-selected={active}
                data-active={active ? "" : undefined}
                data-invalid={row.valid ? undefined : ""}
                className={styles.row}
                onClick={() => onSelect(row.key)}
                onKeyDown={undefined}
              >
                <MonogramTile
                  size="lg"
                  letters={monogramOf(row.id)}
                  logo={row.source === "builtin" ? logoOf(row.id) : undefined}
                  brand={row.source === "builtin" ? brandOf(row.id) : undefined}
                />
                <span className={styles.text}>
                  <span className={styles.name}>
                    <Truncate>
                      <UserText>{pickLocalizedText(row.name, locale)}</UserText>
                    </Truncate>
                  </span>
                  <span className={styles.description} data-warning={row.valid ? undefined : ""}>
                    {row.valid ? (
                      <Truncate>
                        <UserText>{pickLocalizedText(row.description, locale)}</UserText>
                      </Truncate>
                    ) : (
                      <Truncate>
                        <span className={styles.invalid}>
                          {t("desktop.templates.invalid.label")}
                        </span>
                        {problemLabel(t, row.problem)}
                      </Truncate>
                    )}
                  </span>
                </span>
                {row.source === "user" ? (
                  <span className={styles.mine}>{t("desktop.templates.sourceUser.label")}</span>
                ) : (
                  <Badge>{t("desktop.templates.sourceBuiltin.label")}</Badge>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
