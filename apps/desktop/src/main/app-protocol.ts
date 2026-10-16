import { isAbsolute, join, relative, resolve } from "node:path";

// 界面只从应用自己的协议 app://runyard/ 加载打包好的文件，不加载任何远程内容（技术设计 §6.5）。
// 这里只做“地址对应哪个文件”：只许落在界面目录之内，.. 和绝对路径一律拒绝。

export const APP_SCHEME = "app";
export const APP_HOST = "runyard";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** 返回界面目录里的文件路径；地址不属于本应用或试图跳出目录时返回 null */
export function resolveAppFile(rendererDir: string, address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) return null;
  const requested = decodeURIComponent(url.pathname);
  const target = resolve(rendererDir, requested === "/" ? "index.html" : `.${requested}`);
  const inside = relative(rendererDir, target);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return null;
  return join(rendererDir, inside);
}

/** 发消息的页面是不是本应用自己的界面：主进程只响应这样的发送者 */
export function isAppUrl(address: string): boolean {
  return address === `${APP_ORIGIN}/` || address.startsWith(`${APP_ORIGIN}/`);
}
