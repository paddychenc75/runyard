import { useT } from "@runyard/i18n/react";
import { Button, EmptyState, MonogramTile, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { monogramOf, pickLocalizedText, runningCount } from "../library-view.ts";
import styles from "./LibraryPage.module.css";
import { LibraryTable } from "./LibraryTable.tsx";
import { useNow } from "./use-now.ts";

export interface LibraryPageProps {
  bridge: DesktopBridge;
  library: LibraryState | null;
  /** 空状态的“新建项目”：打开模板选择器 */
  onNew: () => void;
  /** 空状态里的常用模板胶囊：直接进入新建弹窗 */
  onCreateFrom: (templateId: string) => void;
}

// 相对时间和“剩 N 天”不靠事件，半分钟走一次字
const CLOCK_INTERVAL_MS = 30_000;

/** 空状态里列出的常用模板（设计稿 Empty：静态页面、React 19、Python），库里没有的就不画 */
const COMMON_TEMPLATES = ["html", "react19", "python"] as const;

/** 空状态里给智能体看的示例命令（设计稿 Empty） */
const SAMPLE_COMMAND = "runyard new react19 --run";

// 资源库页的内容（设计稿 Main、Empty）：页标题和概况、项目表、没有项目时的空状态。
// 搜索筛选随 #181；新建走模板选择器和新建弹窗（#172、#173）。
export function LibraryPage({ bridge, library, onNew, onCreateFrom }: LibraryPageProps) {
  const t = useT();
  const now = useNow(CLOCK_INTERVAL_MS);
  if (library === null) return null;
  const { playgrounds, templates, locale } = library;
  const common = COMMON_TEMPLATES.flatMap((id) => {
    const template = templates.find((candidate) => candidate.id === id);
    return template === undefined ? [] : [template];
  });
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("library.filter.all.label")}</h1>
        <p className={styles.summary}>
          {t("library.page.summary.label", {
            total: playgrounds.length,
            running: runningCount(playgrounds),
          })}
        </p>
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
                    <MonogramTile letters={monogramOf(template.id)} size="lg" />
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
      ) : (
        <LibraryTable bridge={bridge} locale={locale} rows={playgrounds} now={now} />
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
