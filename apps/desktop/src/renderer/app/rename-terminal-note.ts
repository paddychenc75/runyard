import type { Localized, Translate } from "@runyard/i18n";
import type { TerminalStatus } from "../../shared/terminal.ts";

/** 改名会关闭项目开着的终端，名称框下的说明要追加这一句（规格 DESKTOP-TERMINAL-34、35）；没开终端是 null */
export function renameTerminalNote(
  t: Translate,
  terminal: TerminalStatus | null,
): Localized | null {
  if (terminal === null || !terminal.open) return null;
  return terminal.command === null
    ? t("library.rename.terminalClose.hint")
    : t("library.rename.terminalCommand.hint", { command: terminal.command });
}
