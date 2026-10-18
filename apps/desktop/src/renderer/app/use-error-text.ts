import type { Localized } from "@runyard/i18n";
import { useT } from "@runyard/i18n/react";
import type { DesktopError } from "../../shared/library-state.ts";
import { toolName } from "./settings/tool-view.ts";

// 错误码到文案：键 errors.<码>.title / body / hint 由协议登记表推出，参数类型随码变，
// 所以按字符串键调用一次（句子仍然全在文案包里，这里不拼）
type LooseTranslate = (key: string, values?: unknown) => Localized;

export type ErrorTextPart = "title" | "body" | "hint";

export function useErrorText(): (error: DesktopError, part: ErrorTextPart) => Localized {
  const t = useT() as unknown as LooseTranslate;
  return (error, part) => {
    // 工具在句子里写显示名（Node、Go），不写小写的标识
    const tool = error.params.tool;
    const params =
      typeof tool === "string" ? { ...error.params, tool: toolName(tool) } : error.params;
    return t(`errors.${error.code}.${part}`, params);
  };
}
