import type { OpenFilesMemory, RememberedFiles } from "./editor-session.ts";

// 把“上次打开的文件标签”记在界面自己的本地存储里（按项目 id 一份，规格 DESKTOP-EDITOR-20）。
// 存储可能读不出来（隐私窗口、被清、被禁），那就当作从没存过，也不报错：恢复文件标签是便利，不是必须。

const KEY_PREFIX = "runyard.openFiles.";

function isRemembered(value: unknown): value is RememberedFiles {
  if (typeof value !== "object" || value === null) return false;
  const { paths, active } = value as Record<string, unknown>;
  return (
    Array.isArray(paths) &&
    paths.every((path) => typeof path === "string") &&
    (active === null || typeof active === "string")
  );
}

export function localOpenFilesMemory(
  projectId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeLocalStorage(),
): OpenFilesMemory {
  const key = `${KEY_PREFIX}${projectId}`;
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (raw === null || raw === undefined) return null;
        const parsed: unknown = JSON.parse(raw);
        return isRemembered(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        storage?.setItem(key, JSON.stringify(state));
      } catch {
        // 写不进去就算了，下次打开按“第一次”处理
      }
    },
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
