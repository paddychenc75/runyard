import { createTranslator, desktopCatalogs, type Locale, type Localized } from "@runyard/i18n";
import type { SampleData } from "../src/index.ts";
import * as en from "./sample-data.en.ts";
import * as zhCN from "./sample-data.zh-CN.ts";

// 工作台的示例文字不是产品文案，不走文案包；这里把它们标成 Localized，只在工作台和测试里这样做
const localized = (text: string): Localized => text as Localized;

export interface WorkbenchData {
  sample: SampleData;
  chrome: typeof zhCN.chromeText;
}

// 图标的无障碍名字走真正的文案系统（现在借用一条现成的文案；界面文案组随 #164 加入后换成 ui 组的键）
export function workbenchData(locale: Locale): WorkbenchData {
  const { t } = createTranslator({ locale, platform: "darwin", catalogs: desktopCatalogs });
  const source = locale === "zh-CN" ? zhCN : en;
  return {
    sample: {
      label: localized(source.sampleText.label),
      longLabel: localized(source.sampleText.longLabel),
      items: source.sampleText.items.map(localized) as unknown as SampleData["items"],
      userText: source.sampleText.userText,
      iconLabel: t("format.relative.justNow"),
    },
    chrome: source.chromeText,
  };
}
