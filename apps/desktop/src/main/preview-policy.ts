// 预览页面的安全策略（技术设计 §6.5 “预览”）：只放行本机地址，权限默认拒绝、只放行剪贴板。
// 纯函数，Electron 的钩子在 preview-view.ts 里调用它们。

/** 预览只许去 http://127.0.0.1:<端口>/…；localhost、其他主机和其他协议都不行 */
export function isLocalPreviewUrl(address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === "http:" && url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** 放行的权限：只有往剪贴板写（用户操作触发的复制） */
export function isPermissionAllowed(permission: string): boolean {
  return permission === "clipboard-sanitized-write";
}
