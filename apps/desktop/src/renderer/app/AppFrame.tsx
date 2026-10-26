import { desktopCatalogs, type Locale } from "@runyard/i18n";
import { htmlLang, I18nProvider } from "@runyard/i18n/react";
import { useEffect } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { layoutCssVariables } from "../../shared/layout.ts";
import { useLibraryState } from "../bridge/use-library-state.ts";
import type { SettingsApi } from "../bridge/use-settings.ts";
import { AppShell } from "./AppShell.tsx";

export interface AppFrameProps {
  bridge: DesktopBridge;
  locale: Locale;
  theme: DesktopBridge["bootstrap"]["theme"];
  /** 设置读写；不传（测试里）就是没读到设置 */
  settings?: SettingsApi;
}

// 外框：提供文案，并让 <html> 的 lang、data-theme 和版面变量跟着属性走。
// 预加载脚本已经在页面脚本之前写过一遍（第一帧不闪）；这里在属性变了之后（运行中切换）接着写，
// 不需要刷新页面，CSS 立刻整体换色（技术设计 §6.7“切换主题”）。
const NO_SETTINGS: SettingsApi = { settings: null, update: () => {} };

export function AppFrame({ bridge, locale, theme, settings = NO_SETTINGS }: AppFrameProps) {
  const library = useLibraryState(bridge);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = htmlLang(locale);
    root.dataset.theme = theme;
    for (const [name, value] of Object.entries(layoutCssVariables)) {
      root.style.setProperty(name, value);
    }
  }, [locale, theme]);
  return (
    <I18nProvider locale={locale} platform={bridge.bootstrap.platform} catalogs={desktopCatalogs}>
      <AppShell bridge={bridge} library={library} settings={settings} />
    </I18nProvider>
  );
}
