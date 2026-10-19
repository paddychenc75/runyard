import "@runyard/tokens/tokens.css";
import "@runyard/ui/styles/reset.css";
import "@runyard/ui/styles/base.css";
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../src/renderer/app/AppShell.tsx";
import { SettingsWindow } from "../src/renderer/app/settings/SettingsWindow.tsx";
import { layoutCssVariables } from "../src/shared/layout.ts";
import { sceneBridge } from "./bridge.ts";
import { settings } from "./bridge-data.ts";
import { sceneState } from "./scene-state.ts";
import { scenes } from "./scenes.ts";

const query = new URLSearchParams(location.search);
const locale =
  query.get("locale") === "en-XA" ? "en-XA" : query.get("locale") === "zh-CN" ? "zh-CN" : "en";
const theme = query.get("theme") === "dark" ? "dark" : "light";
const scene = scenes.find((item) => item.id === (query.get("scene") ?? "Main"));
if (!scene) throw new Error("未登记的画面");
const state = sceneState(scene.id);
state.locale = locale === "en-XA" ? "en" : locale;
const bridge = sceneBridge(state);
bridge.bootstrap.theme = theme;
bridge.bootstrap.windowKind =
  scene.id === "Settings" || scene.id === "SettingsNarrow" ? "settings" : "main";
Object.defineProperty(window, "runyard", { value: bridge });
document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
for (const [key, value] of Object.entries(layoutCssVariables))
  document.documentElement.style.setProperty(key, value);
const root = document.getElementById("root");
if (!root) throw new Error("画面工作台缺少根元素");
createRoot(root).render(
  <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
    {scene.id === "Settings" || scene.id === "SettingsNarrow" ? (
      <SettingsWindow bridge={bridge} library={state} api={{ settings, update: () => {} }} />
    ) : (
      <AppShell bridge={bridge} library={state} settings={{ settings, update: () => {} }} />
    )}
  </I18nProvider>,
);
