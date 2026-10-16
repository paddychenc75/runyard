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

/** 预览里的导航该怎么处理：放行、拦下并交给系统浏览器、或只拦下 */
export type NavigationDecision = "allow" | "open-external" | "block";

/**
 * 页面里的链接点击（will-navigate）和 window.open 都走这一个判断：
 * 本机地址放行；别的网页地址（http、https）交给系统浏览器、预览不跳转；
 * 其他协议（mailto:、runyard://、file: 等）一律拦下，不交给系统（技术设计 §6.1“导航”）。
 */
export function decideNavigation(address: string): NavigationDecision {
  if (isLocalPreviewUrl(address)) return "allow";
  try {
    const { protocol } = new URL(address);
    if (protocol === "http:" || protocol === "https:") return "open-external";
  } catch {
    // 不是合法地址，当作其他协议拦下
  }
  return "block";
}

/**
 * 把判断接到 Electron 的两个钩子上；openExternal 由调用方传入（真实的是 shell.openExternal，测试里是假的）。
 * 重定向（will-redirect）不交给系统浏览器：服务端的跳转不是用户点的链接，只拦下。
 */
export function createNavigationGuards(openExternal: (address: string) => void) {
  return {
    /** will-navigate：返回 true 表示放行 */
    onWillNavigate(address: string): boolean {
      const decision = decideNavigation(address);
      if (decision === "open-external") openExternal(address);
      return decision === "allow";
    },
    /** will-redirect：只放行本机地址 */
    onWillRedirect(address: string): boolean {
      return decideNavigation(address) === "allow";
    },
    /** window.open / target=_blank：预览里永远不开新窗口 */
    onWindowOpen(address: string): { action: "deny" } {
      if (decideNavigation(address) === "open-external") openExternal(address);
      return { action: "deny" };
    },
  };
}
