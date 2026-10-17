import type { EditorFileResult, FileContent } from "../../../shared/editor-files.ts";
import { type FileTab, isDirty, withContent } from "./file-tab.ts";

// 磁盘上的文件被外部改了，编辑器怎么办（规格 desktop/editor「文件被外部修改」）。纯判断，不碰状态。
// disk 是把磁盘上现在的内容装进同一个标签得到的（withContent）。

export type DiskChangeAction =
  /** 磁盘内容就是编辑器最后读到或写入的：什么都不用做（外部只是 touch 了一下） */
  | "ignore"
  /** 没有未保存修改：直接换成磁盘上的内容（DESKTOP-EDITOR-31） */
  | "replace"
  /** 未保存的修改恰好与磁盘内容相同：不算冲突，只把磁盘内容记为已保存的 */
  | "adopt"
  /** 有未保存修改且与磁盘不同：提示，暂停自动保存（DESKTOP-EDITOR-32） */
  | "conflict";

export function diskChangeAction(tab: FileTab, disk: FileTab): DiskChangeAction {
  // 已标“已删除”的文件又出现了：磁盘上的就是新内容，要走下面的比较，不能当没变
  if (disk.text === tab.savedText && !tab.deleted) return "ignore";
  if (!isDirty(tab)) return "replace";
  return tab.text === disk.text ? "adopt" : "conflict";
}

/** 会话借给这里的几样东西（会话自己的状态不外露） */
export interface DiskHost {
  tab(path: string): FileTab | undefined;
  patch(path: string, change: Partial<FileTab> | FileTab): void;
  read(path: string): Promise<EditorFileResult<FileContent>>;
  /** 这个文件正在进行的写入；没有就是立刻完成的 */
  settled(path: string): Promise<unknown>;
  cancelTimer(path: string): void;
  /** 会话已丢弃 */
  gone(): boolean;
}

/**
 * 读磁盘现在的内容，按编辑器里有没有未保存修改处理（DESKTOP-EDITOR-31、32、35）。
 * 删除的事件也走这条路：读不到才算删了，替换式的保存（先删再建）不会让标签闪成“已删除”。
 */
export async function reconcileDisk(host: DiskHost, path: string): Promise<void> {
  await host.settled(path);
  const savedBefore = host.tab(path)?.savedText;
  const result = await host.read(path);
  // 读的过程中状态可能变了（又输入了、标签关了），以现在的为准
  const tab = host.tab(path);
  if (tab === undefined || tab.view !== "text" || host.gone()) return;
  // 读的过程中自己又存了一次：读到的是更早的内容，拿它去换编辑器里的内容会把刚输入的倒回去（光标跟着跳）。
  // 那次保存自己会带来一个“自己写的”事件，不用在这里处理
  if (tab.savedText !== savedBefore) return;
  if (!result.ok) {
    if (result.error.code === "EDITOR_NOT_FOUND") {
      host.cancelTimer(path);
      host.patch(path, { deleted: true, conflict: false });
    }
    return;
  }
  if (result.value.kind !== "text") return;
  const disk = withContent(tab, result.value);
  switch (diskChangeAction(tab, disk)) {
    case "ignore":
      return;
    case "replace":
      host.patch(path, disk);
      return;
    case "adopt":
      host.patch(path, { savedText: disk.text, saveError: null, deleted: false, conflict: false });
      return;
    case "conflict":
      host.cancelTimer(path);
      host.patch(path, { conflict: true, deleted: false });
      return;
  }
}

/** “用磁盘上的版本”：换成磁盘现在的内容，冲突标记随之消失 */
export async function useDiskVersion(host: DiskHost, path: string): Promise<void> {
  host.cancelTimer(path);
  const result = await host.read(path);
  const tab = host.tab(path);
  if (tab === undefined || tab.view !== "text") return;
  if (result.ok && result.value.kind === "text") {
    host.patch(path, withContent(tab, result.value));
  } else if (!result.ok && result.error.code === "EDITOR_NOT_FOUND") {
    // 这时文件又被删了：内容留着，只是不用再选了
    host.patch(path, { conflict: false, deleted: true });
  }
}
