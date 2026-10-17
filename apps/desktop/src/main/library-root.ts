import type { LibraryClient } from "./library-controller.ts";

/** 资源库文件夹的显示写法：主目录里的缩成 ~/…，别处原样 */
export function displayPath(path: string, home: string): string {
  if (path === home) return "~";
  const prefix = home.endsWith("/") ? home : `${home}/`;
  return path.startsWith(prefix) ? `~/${path.slice(prefix.length)}` : path;
}

/** 读设置里的资源库文件夹：显示写法（新建弹窗的“文件夹：…”提示用）和原样路径（判断是否在同步目录下用）；读不到都是空串，界面就不显示这行提示 */
export async function readLibraryRoot(
  client: LibraryClient,
  home: string,
): Promise<{ display: string; raw: string }> {
  try {
    const settings = await client.call("settings.get", {});
    return { display: displayPath(settings.libraryRoot, home), raw: settings.libraryRoot };
  } catch {
    return { display: "", raw: "" };
  }
}

/** 关闭运行中的标签页前要不要确认；读不到设置就当作要确认：宁可多问一次，不要悄悄停掉用户的运行 */
export async function readConfirmClose(client: LibraryClient): Promise<boolean> {
  return await client.call("settings.get", {}).then(
    (settings) => settings.confirmCloseRunningTab,
    () => true,
  );
}
