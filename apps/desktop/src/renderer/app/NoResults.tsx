import { useT } from "@runyard/i18n/react";
import { Button, EmptyState } from "@runyard/ui";
import styles from "./NoResults.module.css";

export interface NoResultsProps {
  /** 搜索框里的文字；空的话是筛选条件本身没有结果 */
  search: string;
  /** 搜索文字是合法且没被占用的项目名：才有“新建项目，名称用…”（规格 DESKTOP-LIBRARY-VIEW-24、26） */
  canCreate: boolean;
  onClearSearch: () => void;
  onResetFilters: () => void;
  onCreate: () => void;
}

// 搜索或筛选后一个项目都没有（设计稿 NoResults）。
export function NoResults({
  search,
  canCreate,
  onClearSearch,
  onResetFilters,
  onCreate,
}: NoResultsProps) {
  const t = useT();
  const searching = search !== "";
  return (
    <div className={styles.root}>
      <EmptyState
        art="search"
        className={styles.empty}
        title={
          searching
            ? t("library.noResults.title", { query: search })
            : t("library.noResults.filtered.title")
        }
        description={searching ? t("library.noResults.hint") : t("library.noResults.filtered.hint")}
      >
        <div className={styles.actions}>
          <Button size="lg" onClick={searching ? onClearSearch : onResetFilters}>
            {searching ? t("library.noResults.clear.action") : t("library.noResults.reset.action")}
          </Button>
          {canCreate ? (
            <Button variant="primary" size="lg" onClick={onCreate}>
              {t("library.noResults.create.action", { query: search })}
            </Button>
          ) : null}
        </div>
      </EmptyState>
    </div>
  );
}
