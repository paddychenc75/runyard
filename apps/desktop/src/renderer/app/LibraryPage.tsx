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
}

// 相对时间和“剩 N 天”不靠事件，半分钟走一次字
const CLOCK_INTERVAL_MS = 30_000;

// 资源库页的内容（设计稿 Main、Empty）：页标题和概况、项目表、没有项目时的空状态。
// 搜索筛选随 #181，打开和更多菜单随 #171，新建对话框随 #173，所以这里还留着
// 开发期的“用内置模板新建”（模板按钮，设计稿 Empty 里是三个常用模板的胶囊），那几件做好后换掉它。
export function LibraryPage({ bridge, library }: LibraryPageProps) {
  const t = useT();
  const now = useNow(CLOCK_INTERVAL_MS);
  if (library === null) return null;
  const { playgrounds, templates, locale } = library;
  const createButtons = (
    <div className={styles.templates}>
      {templates.map((template) => (
        <Button
          key={template.id}
          onClick={() => void bridge.call("playground.create", template.id)}
        >
          <MonogramTile letters={monogramOf(template.id)} size="lg" />
          <UserText>{pickLocalizedText(template.name, locale)}</UserText>
        </Button>
      ))}
    </div>
  );
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
          {createButtons}
          <p className={styles.cli}>{t("library.empty.cli.label")}</p>
        </EmptyState>
      ) : (
        <>
          <LibraryTable bridge={bridge} locale={locale} rows={playgrounds} now={now} />
          <div className={styles.footer}>
            <h2 className={styles.section}>{t("desktop.create.title")}</h2>
            {createButtons}
          </div>
        </>
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
