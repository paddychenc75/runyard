import type { Localized } from "@runyard/i18n";
import { useT } from "@runyard/i18n/react";
import type { DesktopError } from "../../shared/library-state.ts";

// 错误码到文案：键 errors.<码>.title / body / hint 由协议登记表推出，参数类型随码变，
// 所以按字符串键调用一次（句子仍然全在文案包里，这里不拼）
type LooseTranslate = (key: string, values?: unknown) => Localized;

export type ErrorTextPart = "title" | "body" | "hint";

export function useErrorText(): (error: DesktopError, part: ErrorTextPart) => Localized {
  const t = useT() as unknown as LooseTranslate;
  return (error, part) => t(`errors.${error.code}.${part}`, error.params);
}
