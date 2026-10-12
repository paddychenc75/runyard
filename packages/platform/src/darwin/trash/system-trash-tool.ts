import { access, constants } from "node:fs/promises";

// 系统自带的 /usr/bin/trash（macOS 15 起）：毫秒级、无弹窗，并且写“放回原处”的记录（决策记录 0010）。
export const SYSTEM_TRASH_TOOL = "/usr/bin/trash";

export async function isUsable(tool: string): Promise<boolean> {
  try {
    await access(tool, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
