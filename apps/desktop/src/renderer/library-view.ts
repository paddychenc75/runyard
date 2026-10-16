import { createTranslator, desktopCatalogs, type Locale, type Localized } from "@runyard/i18n";
import type { LocalizedText } from "@runyard/protocol";
import type { LibraryState } from "../shared/library-state.ts";

// 把主进程给的状态变成界面要显示的内容：所有文字在这里经文案包生成，DOM 那一层只管摆。
// 不碰 DOM，所以可以直接测。

export interface RowView {
  id: string;
  name: string;
  stateLabel: Localized;
  action: "run" | "stop";
  actionLabel: Localized;
  busy: boolean;
  previewing: boolean;
}

export interface TemplateView {
  id: string;
  label: string;
}

export interface LibraryView {
  locale: Locale;
  windowTitle: Localized;
  heading: Localized;
  emptyHint: Localized | null;
  rows: RowView[];
  createHeading: Localized;
  templates: TemplateView[];
  previewPlaceholder: Localized;
  errorText: Localized | null;
}

// 错误码到文案：键 errors.<码>.title 由协议登记表推出，参数类型随码变，所以这里按字符串键调用一次
type LooseTranslate = (key: string, values?: unknown) => Localized;

export function pickLocalizedText(text: LocalizedText, locale: Locale): string {
  return typeof text === "string" ? text : (text[locale] ?? text.en);
}

export function buildLibraryView(state: LibraryState): LibraryView {
  const { t } = createTranslator({
    locale: state.locale,
    // 第一版只有 macOS；平台只影响“废纸篓”之类的系统用词，这里的文案用不到
    platform: "darwin",
    catalogs: desktopCatalogs,
  });
  const loose = t as LooseTranslate;
  return {
    locale: state.locale,
    windowTitle: t("desktop.window.title"),
    heading: t("desktop.library.title"),
    emptyHint: state.playgrounds.length === 0 ? t("desktop.library.empty.hint") : null,
    rows: state.playgrounds.map((row) => ({
      id: row.id,
      name: row.name,
      stateLabel: row.state === "idle" ? t("desktop.state.idle.label") : t(`runState.${row.state}`),
      action: row.active ? "stop" : "run",
      actionLabel: row.active ? t("desktop.stop.action") : t("desktop.run.action"),
      busy: row.busy,
      previewing: row.previewing,
    })),
    createHeading: t("desktop.create.title"),
    templates: state.templates.map((template) => ({
      id: template.id,
      label: pickLocalizedText(template.name, state.locale),
    })),
    previewPlaceholder: t("desktop.preview.placeholder"),
    errorText:
      state.error === null
        ? null
        : t("desktop.error.title.label", {
            title: loose(`errors.${state.error.code}.title`, state.error.params),
          }),
  };
}
