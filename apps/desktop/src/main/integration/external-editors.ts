import { execFile } from "node:child_process";
import type { ExternalEditorOption } from "../../shared/settings-bridge.ts";

// 外部编辑器：认得几款常见的、装在“应用程序”文件夹里的编辑器（规格 DESKTOP-SETTINGS-07）。
// 系统上的应用位置是系统的约定，所以写在 integration 目录；探测用注入的 exists，测试里换成假的。

interface KnownEditor {
  id: string;
  /** 显示名；产品名不翻译 */
  name: string;
  /** /Applications 里的应用包名 */
  bundle: string;
}

const KNOWN_EDITORS: readonly KnownEditor[] = [
  { id: "vscode", name: "VS Code", bundle: "Visual Studio Code.app" },
  { id: "cursor", name: "Cursor", bundle: "Cursor.app" },
  { id: "zed", name: "Zed", bundle: "Zed.app" },
  { id: "sublime", name: "Sublime Text", bundle: "Sublime Text.app" },
  { id: "webstorm", name: "WebStorm", bundle: "WebStorm.app" },
];

function applicationDirs(home: string): string[] {
  return ["/Applications", `${home}/Applications`];
}

/** 本机找到的编辑器，按固定顺序 */
export async function detectEditors(
  home: string,
  exists: (path: string) => Promise<boolean>,
): Promise<ExternalEditorOption[]> {
  const found: ExternalEditorOption[] = [];
  for (const editor of KNOWN_EDITORS) {
    for (const dir of applicationDirs(home)) {
      if (await exists(`${dir}/${editor.bundle}`)) {
        found.push({ id: editor.id, name: editor.name });
        break;
      }
    }
  }
  return found;
}

/** 用这款编辑器打开文件夹；id 不认识返回 false。参数是数组、不经 shell */
export function openFolderInEditor(editorId: string, folder: string): boolean {
  const editor = KNOWN_EDITORS.find((candidate) => candidate.id === editorId);
  if (editor === undefined) return false;
  execFile("open", ["-a", editor.bundle.replace(/\.app$/, ""), folder], () => {});
  return true;
}
