import {
  createTranslator,
  desktopCatalogs,
  type Localized,
  pseudoLocale,
  pseudolocalize,
} from "@runyard/i18n";
import type { SampleData } from "../src/index.ts";
import type { WorkbenchLocale } from "./params.ts";
import type { RawSampleText } from "./raw-sample-text.ts";
import * as en from "./sample-data.en.ts";
import * as zhCN from "./sample-data.zh-CN.ts";

// 工作台的示例文字不是产品文案，不走文案包；这里把它们标成 Localized，只在工作台和测试里这样做
const localized = (text: string): Localized => text as Localized;

export interface WorkbenchData {
  sample: SampleData;
  chrome: typeof zhCN.chromeText;
}

function toSample(raw: RawSampleText, iconLabel: Localized): SampleData {
  return {
    label: localized(raw.label),
    longLabel: localized(raw.longLabel),
    items: raw.items.map(localized) as unknown as SampleData["items"],
    userText: raw.userText,
    iconLabel,
  };
}

// 图标的无障碍名字走真正的文案系统（现在借用一条现成的文案；界面文案组随 #164 加入后换成 ui 组的键）
export function workbenchData(locale: WorkbenchLocale): WorkbenchData {
  const { t } = createTranslator({ locale, platform: "darwin", catalogs: desktopCatalogs });
  const iconLabel = t("format.relative.justNow");
  if (locale === pseudoLocale) {
    // 伪语言：每段文字都由英文变出来，页面上任何没包在 ⟦ ⟧ 里的字母都会被漏网扫描抓到；用户内容不变
    const raw = en.sampleText;
    const pseudo: RawSampleText = {
      label: pseudolocalize(raw.label),
      longLabel: pseudolocalize(raw.longLabel),
      items: raw.items.map(pseudolocalize) as unknown as RawSampleText["items"],
      userText: raw.userText,
    };
    const chrome = Object.fromEntries(
      Object.entries(en.chromeText).map(([key, text]) => [key, pseudolocalize(text)]),
    ) as typeof en.chromeText;
    return { sample: toSample(pseudo, iconLabel), chrome };
  }
  const source = locale === "zh-CN" ? zhCN : en;
  return { sample: toSample(source.sampleText, iconLabel), chrome: source.chromeText };
}
