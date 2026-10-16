// @runyard/i18n/react：界面用的 React 绑定。命令行不导入它（技术设计 §6.8）。
export { useTranslator } from "./context.ts";
export { useFormat, useLocale, useT } from "./hooks.ts";
export { htmlLang, I18nProvider, type I18nProviderProps } from "./provider.ts";
export { T, type TProps } from "./t.ts";
