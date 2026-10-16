import { createTranslator, desktopCatalogs, pseudoLocale, pseudolocalize } from "@runyard/i18n";
import type { SampleData } from "../src/index.ts";
import type { WorkbenchLocale } from "./params.ts";
import * as en from "./sample-data.en.ts";
import * as zhCN from "./sample-data.zh-CN.ts";

export interface WorkbenchData {
  sample: SampleData;
  chrome: typeof zhCN.chromeText;
}

// 图标的无障碍名字走真正的文案系统（现在借用一条现成的文案；界面文案组随 #164 加入后换成 ui 组的键）
export function workbenchData(locale: WorkbenchLocale): WorkbenchData {
  const { t } = createTranslator({ locale, platform: "darwin", catalogs: desktopCatalogs });
  const iconLabel = t("format.relative.justNow");
  if (locale === pseudoLocale) {
    // 伪语言：每段文字都由英文变出来，页面上任何没包在 ⟦ ⟧ 里的字母都会被漏网扫描抓到
    const mapAll = <T extends Record<string, string>>(texts: T): T =>
      Object.fromEntries(
        Object.entries(texts).map(([key, text]) => [key, pseudolocalize(text)]),
      ) as T;
    return { sample: { ...mapAll(en.sampleText), iconLabel }, chrome: mapAll(en.chromeText) };
  }
  const source = locale === "zh-CN" ? zhCN : en;
  return { sample: { ...source.sampleText, iconLabel }, chrome: source.chromeText };
}
