import { useMemo } from "react";
import type { Translate } from "../create-translator.ts";
import { createFormat, type Format } from "../format.ts";
import type { Locale } from "../locale.ts";
import { useTranslator } from "./context.ts";

/** 取文案：`const t = useT(); t("library.empty.title")`，结果是 Localized */
export function useT(): Translate {
  return useTranslator().t;
}

export function useLocale(): Locale {
  return useTranslator().locale;
}

/** 数字、日期、大小、时长的统一出口（功能模块不直接调 Intl，也不自己拼单位） */
export function useFormat(): Format {
  const translator = useTranslator();
  return useMemo(() => createFormat(translator), [translator]);
}
