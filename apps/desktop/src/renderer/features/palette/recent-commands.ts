import { type CommandId, commandIds } from "../../../shared/commands.ts";
import { MAX_RECENT_COMMANDS } from "./palette-model.ts";

// “最近使用”的命令（规格 DESKTOP-EDITOR-57）：记在界面自己的存储里，重开应用还在。
// 存储可能读不到或写不进（隐私模式、被清掉），那就退回“只在这次运行里记着”，不影响使用。

const KEY = "runyard.palette.recent";

export function readRecentCommands(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): CommandId[] {
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is CommandId => commandIds.includes(id as CommandId));
  } catch {
    return [];
  }
}

/** 把 id 放到最前（去重，保留 MAX_RECENT_COMMANDS 条）并写回；返回新的列表 */
export function rememberCommand(
  id: CommandId,
  current: readonly CommandId[],
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): CommandId[] {
  const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_RECENT_COMMANDS);
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // 写不进就只在内存里留着
  }
  return next;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
