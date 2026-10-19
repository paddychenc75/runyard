import { cliCatalogs, createTranslator, type Locale, type PlatformId } from "@runyard/i18n";

/** 安装语言与命令行显示语言无关：英文供智能体执行，中文供人阅读。 */
export function skillText(locale: Locale, platform: PlatformId): string {
  return `${createTranslator({ locale, platform, catalogs: cliCatalogs }).t("cli.skillGuide.body")}\n`;
}
