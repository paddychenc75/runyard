import type { SampleData } from "../src/index.ts";
import type { chromeText as zhChromeText } from "./sample-data.zh-CN.ts";

export const sampleText: Omit<SampleData, "iconLabel"> = {
  label: "Create and run",
  longLabel: "Copy this practice project into another folder and start running it right away",
};

export const chromeText: typeof zhChromeText = {
  title: "Component workbench",
  components: "Components",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  locale: "Language",
  localeEn: "English",
  localeZh: "简体中文",
};
