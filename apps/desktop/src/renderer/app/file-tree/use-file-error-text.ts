import type { Localized } from "@runyard/i18n";
import { useT } from "@runyard/i18n/react";
import type { EditorFileError } from "../../../shared/editor-files.ts";
import { baseNameOf } from "./file-tree-model.ts";

// 文件服务的错误（代码加参数）到一句话。句子在文案包里，这里只选键、填参数。
export function useFileErrorText(): (error: EditorFileError) => Localized {
  const t = useT();
  return (error) => {
    switch (error.code) {
      case "EDITOR_NAME_EXISTS":
        return t("workspace.files.nameExists.hint", { name: error.params.name });
      case "EDITOR_NAME_INVALID":
        return t("workspace.files.nameInvalid.hint", { reason: error.params.reason });
      case "EDITOR_TRASH_FAILED":
        return t("workspace.files.trashFailed.hint", { name: baseNameOf(error.params.path) });
      case "EDITOR_NOT_FOUND":
        return t("workspace.files.notFound.hint", { name: baseNameOf(error.params.path) });
      case "EDITOR_SAVE_FAILED":
        return t("workspace.files.saveFailed.hint", {
          name: baseNameOf(error.params.path),
          // ICU 的选择项不能带连字符
          reason: error.params.reason === "read-only" ? "readOnly" : error.params.reason,
        });
      case "EDITOR_PATH_OUTSIDE":
        return t("workspace.files.outside.hint");
      default:
        return t("workspace.files.failed.hint");
    }
  };
}
