import { useT } from "@runyard/i18n/react";
import { Button, EmptyState, MonogramTile, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import {
  canCreateFromSearch,
  filterRows,
  isFiltering,
  type LibraryQuery,
  sortKeys,
  statusFilters,
  typeFilters,
} from "../library-query.ts";
import { logoOf, monogramOf, pickLocalizedText, runningCount } from "../library-view.ts";
import { FilterMenu } from "./FilterMenu.tsx";
import styles from "./LibraryPage.module.css";
import { LibraryTable } from "./LibraryTable.tsx";
import { navLabel, sortLabel, statusLabel, typeLabel } from "./library-labels.ts";
import { NoResults } from "./NoResults.tsx";
import { useNow } from "./use-now.ts";

export interface LibraryPageProps {
  bridge: DesktopBridge;
  library: LibraryState | null;
  /** 搜索、侧栏筛选、三个下拉的当前值（外壳持有：顶栏的搜索框和侧栏也要用） */
  query: LibraryQuery;
  onQueryChange: (patch: Partial<LibraryQuery>) => void;
  /** 空状态的“新建项目”：打开模板选择器 */
  onNew: () => void;
  /** 空状态里的常用模板胶囊：直接进入新建弹窗 */
  onCreateFrom: (templateId: string) => void;
  /** “没有结果”画面的“新建项目，名称用…”：打开选择器，新建弹窗里名称预先填好 */
  onNewNamed: (name: string) => void;
}

// 相对时间和“剩 N 天”不靠事件，半分钟走一次字
const CLOCK_INTERVAL_MS = 30_000;

/** 空状态里列出的常用模板（设计稿 Empty：静态页面、React 19、Python），库里没有的就不画 */
const COMMON_TEMPLATES = ["html", "react19", "python"] as const;

/** 空状态里给智能体看的示例命令（设计稿 Empty） */
const SAMPLE_COMMAND = "runyard new react19 --run";

// 资源库页的内容（设计稿 Main、Empty）：页标题和概况、项目表、没有项目时的空状态。
// 搜索、筛选、排序（#181）；新建走模板选择器和新建弹窗（#172、#173）。
export function LibraryPage({
  bridge,
  library,
  query,
  onQueryChange,
  onNew,
  onCreateFrom,
  onNewNamed,
}: LibraryPageProps) {
  const t = useT();
  const now = useNow(CLOCK_INTERVAL_MS);
  if (library === null) return null;
  const { playgrounds, templates, locale } = library;
  const visible = filterRows(playgrounds, templates, locale, query);
  const filtering = isFiltering(query);
  const common = COMMON_TEMPLATES.flatMap((id) => {
    const template = templates.find((candidate) => candidate.id === id);
    return template === undefined ? [] : [template];
  });
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{navLabel(query.nav, t)}</h1>
          <p className={styles.summary}>
            {filtering
              ? t("library.page.results.label", {
                  count: visible.length,
                  total: playgrounds.length,
                  root: library.libraryRoot,
                })
              : t("library.page.summary.label", {
                  total: playgrounds.length,
                  running: runningCount(playgrounds),
                  root: library.libraryRoot,
                })}
          </p>
        </div>
        {playgrounds.length === 0 ? null : (
          <div className={styles.filters}>
            <FilterMenu
              buttonLabel={t("library.filter.type.label", { value: typeLabel(query.type, t) })}
              menuLabel={t("library.menu.type.aria")}
              options={typeFilters.map((id) => ({ id, label: typeLabel(id, t) }))}
              value={query.type}
              onValueChange={(type) => onQueryChange({ type: type as LibraryQuery["type"] })}
            />
            <FilterMenu
              buttonLabel={t("library.filter.status.label", {
                value: statusLabel(query.status, t),
              })}
              menuLabel={t("library.menu.status.aria")}
              options={statusFilters.map((id) => ({ id, label: statusLabel(id, t) }))}
              value={query.status}
              onValueChange={(status) =>
                onQueryChange({ status: status as LibraryQuery["status"] })
              }
            />
            <FilterMenu
              buttonLabel={t("library.filter.sort.label", { value: sortLabel(query.sort, t) })}
              menuLabel={t("library.menu.sort.aria")}
              options={sortKeys.map((id) => ({ id, label: sortLabel(id, t) }))}
              value={query.sort}
              onValueChange={(sort) => onQueryChange({ sort: sort as LibraryQuery["sort"] })}
            />
          </div>
        )}
      </header>
      {library.error === null ? null : (
        <p className={styles.error}>
          {t("desktop.error.title.label", { title: errorTitle(library, t) })}
        </p>
      )}
      {playgrounds.length === 0 ? (
        <EmptyState
          className={styles.empty}
          title={t("library.empty.title")}
          description={t("library.empty.hint")}
        >
          <Button variant="primary" icon="plus" className={styles.newButton} onClick={onNew}>
            {t("desktop.create.newProject.action")}
          </Button>
          {common.length === 0 ? null : (
            <>
              <p className={styles.hint}>{t("desktop.empty.templates.hint")}</p>
              <div className={styles.templates}>
                {common.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.chip}
                    onClick={() => onCreateFrom(template.id)}
                  >
                    <MonogramTile
                      letters={monogramOf(template.id)}
                      logo={logoOf(template.id)}
                      size="lg"
                    />
                    <UserText>{pickLocalizedText(template.name, locale)}</UserText>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className={styles.cli}>
            <span>{t("library.empty.cli.label")}</span>
            <code className={styles.command}>{SAMPLE_COMMAND}</code>
          </div>
        </EmptyState>
      ) : visible.length === 0 ? (
        <NoResults
          search={query.search}
          canCreate={canCreateFromSearch(query.search, playgrounds)}
          onClearSearch={() => onQueryChange({ search: "" })}
          onResetFilters={() => onQueryChange({ nav: "all", type: "all", status: "all" })}
          onCreate={() => onNewNamed(query.search)}
        />
      ) : (
        <LibraryTable bridge={bridge} locale={locale} rows={visible} now={now} />
      )}
    </section>
  );
}

// 错误码到文案：键 errors.<码>.title 由协议登记表推出，参数类型随码变，所以按字符串键调用一次
type LooseTranslate = (key: string, values?: unknown) => ReturnType<ReturnType<typeof useT>>;

function errorTitle(library: LibraryState, t: ReturnType<typeof useT>) {
  const error = library.error;
  const loose = t as unknown as LooseTranslate;
  return loose(`errors.${error?.code ?? "INTERNAL"}.title`, error?.params);
}
