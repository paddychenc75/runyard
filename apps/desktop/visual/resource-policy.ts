/** 测试站点与Electron本地协议的资源适配，不是生产联网豁免。只映射已实际构建的文件。 */
export function resourceTarget(
  request: string,
  site: string,
  assets: ReadonlySet<string>,
): string | null {
  // 必须先检查原始串；URL构造器会把编码的点目录归一化，之后检查就太晚。
  if (request.includes("\\") || request.includes("..") || request.includes("%")) return null;
  let url: URL;
  try {
    url = new URL(request);
  } catch {
    return null;
  }
  if (url.pathname.includes("%") || url.username || url.password || url.hash) return null;
  if (!assets.has(url.pathname)) return null;
  if (url.origin === new URL(site).origin) return request;
  if (
    url.protocol === "app:" &&
    url.host === "runyard" &&
    url.search === "" &&
    /^\/(editor|workers)\/[\w.-]+$/.test(url.pathname)
  )
    return new URL(url.pathname, site).href;
  return null;
}
