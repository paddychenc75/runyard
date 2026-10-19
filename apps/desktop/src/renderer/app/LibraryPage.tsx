import { useT } from "@runyard/i18n/react";
import { Button, EmptyState, MonogramTile, UserText } from "@runyard/ui";
import type { RefObject } from "react";
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
import { brandOf, logoOf, monogramOf, pickLocalizedText, runningCount } from "../library-view.ts";
import { useElementWidth } from "../shared/viewport.ts";
import { CleanBanner } from "./CleanBanner.tsx";
import { CombinedFilterMenu } from "./CombinedFilterMenu.tsx";
import { FilterMenu } from "./FilterMenu.tsx";
import styles from "./LibraryPage.module.css";
import { LibraryTable } from "./LibraryTable.tsx";
import { navLabel, sortLabel, statusLabel, typeLabel } from "./library-labels.ts";
import { NavEmptyState } from "./NavEmptyState.tsx";
import { NoResults } from "./NoResults.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { UpdateBanner } from "./UpdateBanner.tsx";
import { useNow } from "./use-now.ts";

export interface LibraryPageProps {
  bridge: DesktopBridge;
  library: LibraryState | null;
  /** 搜索、侧栏筛选、三个下拉的当前值（外壳持有：顶栏的搜索框和侧栏也要用） */
  query: LibraryQuery;
  onQueryChange: (patch: Partial<LibraryQuery>) => void;
  /** 页头搜索框的输入元素：⌘F 由外壳把焦点放进去（规格 DESKTOP-LIBRARY-VIEW-14） */
  searchRef: RefObject<HTMLInputElement | null>;
  /** 空状态的“新建项目”：打开模板选择器 */
  onNew: () => void;
  /** 空状态里的常用模板胶囊：直接进入新建弹窗 */
  onCreateFrom: (templateId: string) => void;
  /** “没有结果”画面的“新建项目，名称用…”：打开选择器，新建弹窗里名称预先填好 */
  onNewNamed: (name: string) => void;
}

// 相对时间和“剩 N 天”不靠事件，半分钟走一次字
const CLOCK_INTERVAL_MS = 30_000;

/** 页头比它窄就收紧：搜索框 240 缩到 180、类型和状态合成“筛选”；比 COMPACT 还窄，搜索框缩成放大镜（规格 DESKTOP-LIBRARY-VIEW-67、68） */
export const HEADER_WIDE_PX = 800;
export const HEADER_COMPACT_PX = 560;

/** 页头宽度（0 是还没量到，当作宽）对应的收紧档 */
export function headerMode(width: number): "wide" | "compact" | "icon" {
  if (width === 0 || width >= HEADER_WIDE_PX) return "wide";
  return width >= HEADER_COMPACT_PX ? "compact" : "icon";
}

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
  searchRef,
  onNew,
  onCreateFrom,
  onNewNamed,
}: LibraryPageProps) {
  const t = useT();
  const now = useNow(CLOCK_INTERVAL_MS);
  const [headerRef, headerWidth] = useElementWidth<HTMLElement>();
  const mode = headerMode(headerWidth);
  if (library === null) return null;
  const { playgrounds, templates, locale } = library;
  const visible = filterRows(playgrounds, templates, locale, query);
  const filtering = isFiltering(query);
  const status = query.nav === "running" ? "running" : query.status;
  const common = COMMON_TEMPLATES.flatMap((id) => {
    const template = templates.find((candidate) => candidate.id === id);
    return template === undefined ? [] : [template];
  });
  return (
    <section className={styles.root}>
      <header ref={headerRef} className={styles.header}>
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
            <SearchBox
              value={query.search}
              onValueChange={(search) => onQueryChange({ search })}
              inputRef={searchRef}
              size={mode === "wide" ? "wide" : mode === "compact" ? "short" : "icon"}
            />
            {mode === "wide" ? (
              <>
                <FilterMenu
                  buttonLabel={t("library.filter.type.label", { value: typeLabel(query.type, t) })}
                  menuLabel={t("library.menu.type.aria")}
                  options={typeFilters.map((id) => ({ id, label: typeLabel(id, t) }))}
                  value={query.type}
                  onValueChange={(type) => onQueryChange({ type: type as LibraryQuery["type"] })}
                />
                <FilterMenu
                  buttonLabel={t("library.filter.status.label", {
                    value: statusLabel(status, t),
                  })}
                  menuLabel={t("library.menu.status.aria")}
                  options={statusFilters.map((id) => ({ id, label: statusLabel(id, t) }))}
                  value={status}
                  disabled={query.nav === "running"}
                  onValueChange={(status) =>
                    onQueryChange({ status: status as LibraryQuery["status"] })
                  }
                />
              </>
            ) : (
              <CombinedFilterMenu
                buttonLabel={t("library.filter.combined.label")}
                menuLabel={t("library.filter.combined.label")}
                groups={[
                  {
                    id: "type",
                    title: t("library.menu.type.aria"),
                    options: typeFilters.map((id) => ({ id, label: typeLabel(id, t) })),
                    value: query.type,
                  },
                  {
                    id: "status",
                    title: t("library.menu.status.aria"),
                    options: statusFilters.map((id) => ({ id, label: statusLabel(id, t) })),
                    value: status,
                    disabled: query.nav === "running",
                  },
                ]}
                onValueChange={(group, id) =>
                  onQueryChange(
                    group === "type"
                      ? { type: id as LibraryQuery["type"] }
                      : { status: id as LibraryQuery["status"] },
                  )
                }
              />
            )}
            <FilterMenu
              buttonLabel={
                mode === "wide"
                  ? t("library.filter.sort.label", { value: sortLabel(query.sort, t) })
                  : sortLabel(query.sort, t)
              }
              menuLabel={t("library.menu.sort.aria")}
              options={sortKeys.map((id) => ({ id, label: sortLabel(id, t) }))}
              value={query.sort}
              onValueChange={(sort) => onQueryChange({ sort: sort as LibraryQuery["sort"] })}
            />
          </div>
        )}
      </header>
      <UpdateBanner bridge={bridge} update={library.update} />
      <CleanBanner bridge={bridge} items={library.cleanReminder ?? []} playgrounds={playgrounds} />
      {library.error === null ? null : (
        <p className={styles.error}>
          {t("desktop.error.title.label", { title: errorTitle(library, t) })}
        </p>
      )}
      {visible.length === 0 &&
      query.nav !== "all" &&
      query.search === "" &&
      query.type === "all" &&
      (query.nav === "running" || query.status === "all") ? (
        <NavEmptyState nav={query.nav} />
      ) : playgrounds.length === 0 ? (
        <EmptyState
          className={styles.empty}
          title={t("library.empty.title")}
          description={t("library.empty.hint")}
        >
          <Button
            variant="primary"
            size="lg"
            icon="plus"
            className={styles.newButton}
            onClick={onNew}
          >
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
                      brand={brandOf(template.id)}
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
        <LibraryTable
          bridge={bridge}
          locale={locale}
          rows={visible}
          now={now}
          sort={query.sort}
          onSortChange={(sort) => onQueryChange({ sort })}
        />
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
