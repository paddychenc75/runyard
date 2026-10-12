import { fallbackLocale, type Locale, locales, type PlatformId } from "./locale.ts";
import { type Localized, markLocalized } from "./localized.ts";
import { formatMessage, type MessageValues } from "./message-format.ts";
import type { MessageKey, MessageMap, Messages, ValuesArgs } from "./messages.ts";

// 一组文案：每种语言一份“键 → ICU 文案”。两种语言都打进命令行，运行时按语言选，不读系统语言。
export type Catalog = Readonly<Record<Locale, Readonly<Record<string, string>>>>;

export interface TranslatorOptions {
  locale: Locale;
  platform: PlatformId;
  catalogs: readonly Catalog[];
}

export type Translate<P extends MessageMap = Messages> = <K extends MessageKey<P>>(
  key: K,
  ...args: ValuesArgs<P[K]>
) => Localized;

export interface Translator<P extends MessageMap = Messages> {
  readonly locale: Locale;
  readonly t: Translate<P>;
}

const TERM_GROUP = "platform.";

// 键在当前语言里找；没有就回退英文（技术设计 §6.8 规则 2）；英文也没有就原样返回键，
// 让漏洞在界面上显眼而不是抛错崩掉命令（缺键由 i18n-keys 检查在合并前拦住）。
export function createTranslator<P extends MessageMap = Messages>(
  options: TranslatorOptions,
): Translator<P> {
  const { locale, platform, catalogs } = options;

  const lookup = (key: string): { message: string; locale: Locale } | undefined => {
    for (const candidate of locale === fallbackLocale ? [locale] : [locale, fallbackLocale]) {
      for (const catalog of catalogs) {
        const message = catalog[candidate]?.[key];
        if (message !== undefined) return { message, locale: candidate };
      }
    }
    return undefined;
  };

  // platform.<名> 的文案对应参数 term_<名>：一处写选择，其他文案只引用
  let terms: MessageValues | undefined;
  const termValues = (): MessageValues => {
    if (terms !== undefined) return terms;
    const values: Record<string, string> = { platform };
    const names = new Set<string>();
    for (const catalog of catalogs) {
      for (const language of locales) {
        for (const key of Object.keys(catalog[language] ?? {})) {
          if (key.startsWith(TERM_GROUP)) names.add(key.slice(TERM_GROUP.length));
        }
      }
    }
    for (const name of names) {
      const found = lookup(`${TERM_GROUP}${name}`);
      if (found !== undefined)
        values[`term_${name}`] = formatMessage(found.locale, found.message, { platform });
    }
    terms = values;
    return values;
  };

  const t = ((key: string, values?: MessageValues) => {
    const found = lookup(key);
    if (found === undefined) return markLocalized(key);
    return markLocalized(
      formatMessage(found.locale, found.message, { ...values, ...termValues() }),
    );
  }) as Translate<P>;

  return { locale, t };
}
