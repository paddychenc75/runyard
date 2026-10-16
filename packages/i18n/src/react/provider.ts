import { createElement, type ReactNode, useMemo } from "react";
import { type Catalog, createTranslator, type TranslatorLocale } from "../create-translator.ts";
import type { Locale, PlatformId } from "../locale.ts";
import { TranslatorContext } from "./context.ts";

export interface I18nProviderProps {
  locale: TranslatorLocale;
  platform: PlatformId;
  /** 要保持引用稳定（模块级常量，如 desktopCatalogs），否则每次渲染都重建翻译函数 */
  catalogs: readonly Catalog[];
  children?: ReactNode;
}

/**
 * 界面的文案入口。语言变了（props.locale 变）整棵树重新取文案，不需要刷新页面
 * （技术设计 §6.8“运行时切换语言”）。
 */
export function I18nProvider(props: I18nProviderProps): ReactNode {
  const { locale, platform, catalogs, children } = props;
  const translator = useMemo(
    () => createTranslator({ locale, platform, catalogs }),
    [locale, platform, catalogs],
  );
  return createElement(TranslatorContext.Provider, { value: translator }, children);
}

/** `<html lang>` 跟着界面语言设：zh-CN 或 en（伪语言按英文） */
export function htmlLang(locale: Locale): "zh-CN" | "en" {
  return locale === "zh-CN" ? "zh-CN" : "en";
}
