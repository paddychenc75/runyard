import { isLocale, type Locale, type PseudoLocale, pseudoLocale } from "@runyard/i18n";

// 工作台的地址栏参数：?component=Button&theme=dark&locale=en&platform=darwin（技术设计 §6.7）。
// 截图流水线用同一组参数打开页面，所以解析要稳：不认识的值一律回退默认，不报错。

export type ThemeChoice = "system" | "light" | "dark";

/** 第一版只有 darwin；加 Windows 时才有 win32（技术设计 §6.7） */
export type WorkbenchPlatform = "darwin";

/** 工作台比设置页多一种语言：伪语言只在开发和测试里可选（技术设计 §6.8） */
export type WorkbenchLocale = Locale | PseudoLocale;

export interface WorkbenchParams {
  /** 选中的组件名；null 表示列表里的第一个 */
  component: string | null;
  theme: ThemeChoice;
  locale: WorkbenchLocale;
  platform: WorkbenchPlatform;
}

export const defaultParams: WorkbenchParams = {
  component: null,
  theme: "system",
  locale: "en",
  platform: "darwin",
};

function parseLocale(value: string | null): WorkbenchLocale {
  if (value === pseudoLocale) return pseudoLocale;
  return value !== null && isLocale(value) ? value : defaultParams.locale;
}

export function parseParams(search: string): WorkbenchParams {
  const query = new URLSearchParams(search);
  const theme = query.get("theme");
  const locale = query.get("locale");
  return {
    component: query.get("component") || null,
    theme: theme === "light" || theme === "dark" ? theme : "system",
    locale: parseLocale(locale),
    platform: "darwin",
  };
}

// 只写和默认值不同的参数，地址栏保持短
export function formatParams(params: WorkbenchParams): string {
  const query = new URLSearchParams();
  if (params.component !== null) query.set("component", params.component);
  if (params.theme !== defaultParams.theme) query.set("theme", params.theme);
  if (params.locale !== defaultParams.locale) query.set("locale", params.locale);
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}
