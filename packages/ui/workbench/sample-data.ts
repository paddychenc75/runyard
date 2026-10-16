import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import type { SampleData } from "../src/index.ts";
import * as en from "./sample-data.en.ts";
import * as zhCN from "./sample-data.zh-CN.ts";

export interface WorkbenchData {
  sample: SampleData;
  chrome: typeof zhCN.chromeText;
}

// 图标的无障碍名字走真正的文案系统（现在借用一条现成的文案；界面文案组随 #164 加入后换成 ui 组的键）
export function workbenchData(locale: Locale): WorkbenchData {
  const { t } = createTranslator({ locale, platform: "darwin", catalogs: desktopCatalogs });
  const source = locale === "zh-CN" ? zhCN : en;
  return {
    sample: { ...source.sampleText, iconLabel: t("format.relative.justNow") },
    chrome: source.chromeText,
  };
}
