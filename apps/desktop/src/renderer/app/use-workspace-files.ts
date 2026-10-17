import { useMemo, useState } from "react";
import type { FileTreeHost } from "./file-tree/use-file-tree.ts";

// 工作区里“打开着哪个文件”的最小状态（#258 的占位）：编辑器和文件标签（#259）接进来之后，
// 由它们的状态取代这里：openFile 开标签并选中，onRenamed 和 onTrashed 让标签跟着改路径或关闭，
// unsavedContent 交出没保存的内容。名字和形状就是 FileTreeHost，所以树这一侧不用改。
export function useWorkspaceFiles(): FileTreeHost {
  const [activePath, setActivePath] = useState<string | null>(null);
  return useMemo(
    () => ({
      activePath,
      openFile: setActivePath,
      onRenamed: (from, to) => setActivePath((now) => (now === from ? to : now)),
      onTrashed: (path) =>
        setActivePath((now) =>
          now !== null && (now === path || now.startsWith(`${path}/`)) ? null : now,
        ),
    }),
    [activePath],
  );
}
