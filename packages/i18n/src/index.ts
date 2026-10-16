// 包的唯一入口：其他包只从 @runyard/i18n 导入

export { cliCatalogs } from "./cli-catalogs.ts";
export { createTestTranslator } from "./create-test-translator.ts";
export {
  type Catalog,
  createTranslator,
  type Translate,
  type Translator,
  type TranslatorLocale,
  type TranslatorOptions,
} from "./create-translator.ts";
export { desktopCatalogs } from "./desktop-catalogs.ts";
export { createFormat, type DateStyle, type Format } from "./format.ts";
export {
  fallbackLocale,
  isLocale,
  type Locale,
  locales,
  type PlatformId,
  sourceLocale,
} from "./locale.ts";
export type { Localized } from "./localized.ts";
export type {
  MessageValue,
  MessageValues,
  RichTagFormatter,
  RichTags,
  TagFormatter,
} from "./message-format.ts";
export type {
  CodeMessages,
  ErrorMessageField,
  MessageKey,
  MessageMap,
  Messages,
  ValuesArgs,
} from "./messages.ts";
export {
  PSEUDO_CLOSE,
  PSEUDO_OPEN,
  type PseudoLocale,
  pseudoLocale,
  pseudolocalize,
} from "./pseudo.ts";
export {
  collectPageTexts,
  findLeakedText,
  type PageNodeLike,
  type PageText,
  scanPageForLeaks,
} from "./pseudo-scan.ts";
export {
  type CliLocaleInput,
  type CliLocaleResolution,
  type CliLocaleSource,
  resolveCliLocale,
} from "./resolve-cli-locale.ts";
