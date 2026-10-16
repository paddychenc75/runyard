import { createContext, useContext } from "react";
import type { Translator } from "../create-translator.ts";

export const TranslatorContext = createContext<Translator | null>(null);

// 开发者诊断，英文：没包 I18nProvider 就用，是接线错误，不是用户会看到的状态
export function useTranslator(): Translator {
  const translator = useContext(TranslatorContext);
  if (translator === null) throw new Error("useTranslator must be used inside <I18nProvider>");
  return translator;
}
