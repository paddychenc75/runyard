import type { EditorFileError, SaveProblem } from "../../../shared/editor-files.ts";
import { type FileTab, isDirty } from "./file-tab.ts";
import type { SessionFiles } from "./session-types.ts";

// 把一个文件标签的内容写进磁盘（规格 desktop/editor「自动保存三档」）。写入的排队和计时在会话里。

/** 会话借给这里的几样东西（会话自己的状态不外露） */
export interface WriteHost {
  tab(path: string): FileTab | undefined;
  patch(path: string, change: Partial<FileTab>): void;
  write: SessionFiles["write"];
}

function saveReason(error: EditorFileError): SaveProblem {
  return error.code === "EDITOR_SAVE_FAILED" ? error.params.reason : "other";
}

/** 写入当前内容；失败时内容和未保存标记保留，原因记在 saveError（DESKTOP-EDITOR-29）。返回有没有成功 */
export async function writeTab(host: WriteHost, path: string): Promise<boolean> {
  const tab = host.tab(path);
  if (tab === undefined || tab.view !== "text") return true;
  if (!isDirty(tab) && tab.saveError === null && !tab.deleted) return true;
  const snapshot = tab.text;
  const content = tab.bom ? `\uFEFF${snapshot}` : snapshot;
  host.patch(path, { saving: true });
  const result = await host.write(path, content, tab.eol === "none" ? undefined : tab.eol);
  if (result.ok) {
    // 写的过程中又输入了的话 text 已经变了，只记下写进去的那一份，未保存标记留着。
    // 换行不统一的提示只给一次：写过一次，磁盘上就已经统一了（DESKTOP-EDITOR-55）
    host.patch(path, {
      savedText: snapshot,
      saveError: null,
      deleted: false,
      mixedEol: false,
      saving: false,
    });
    return true;
  }
  host.patch(path, { saveError: saveReason(result.error), saving: false });
  return false;
}
