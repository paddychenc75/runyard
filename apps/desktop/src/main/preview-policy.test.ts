import { describe, expect, it } from "vitest";
import {
  createNavigationGuards,
  decideNavigation,
  isLocalPreviewUrl,
  isPermissionAllowed,
} from "./preview-policy.ts";

describe("预览的安全策略", () => {
  it("只放行 http://127.0.0.1 的地址", () => {
    expect(isLocalPreviewUrl("http://127.0.0.1:7101/")).toBe(true);
    expect(isLocalPreviewUrl("http://127.0.0.1:7101/a/b?c=1")).toBe(true);
    expect(isLocalPreviewUrl("http://localhost:7101/")).toBe(false);
    expect(isLocalPreviewUrl("https://127.0.0.1:7101/")).toBe(false);
    expect(isLocalPreviewUrl("http://127.0.0.1.evil.com/")).toBe(false);
    expect(isLocalPreviewUrl("file:///etc/passwd")).toBe(false);
    expect(isLocalPreviewUrl("mailto:a@b.c")).toBe(false);
    expect(isLocalPreviewUrl("nope")).toBe(false);
  });

  it("权限默认拒绝，只放行往剪贴板写", () => {
    expect(isPermissionAllowed("clipboard-sanitized-write")).toBe(true);
    for (const denied of [
      "media",
      "geolocation",
      "notifications",
      "clipboard-read",
      "pointerLock",
    ]) {
      expect(isPermissionAllowed(denied)).toBe(false);
    }
  });
});

describe("预览里的导航", () => {
  it("[DESKTOP-WORKSPACE-14] 点外部链接：交给系统浏览器，预览不跳转", () => {
    const opened: string[] = [];
    const guards = createNavigationGuards((address) => opened.push(address));
    // 点链接 -> will-navigate：不放行（预览不跳转），同时交给系统浏览器
    expect(guards.onWillNavigate("https://example.com/docs")).toBe(false);
    expect(opened).toEqual(["https://example.com/docs"]);
    // target=_blank / window.open：不开新窗口，同样交给系统浏览器
    expect(guards.onWindowOpen("http://example.org/")).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://example.com/docs", "http://example.org/"]);
  });

  it("本机地址在预览里正常跳转，不交给系统浏览器", () => {
    const opened: string[] = [];
    const guards = createNavigationGuards((address) => opened.push(address));
    expect(guards.onWillNavigate("http://127.0.0.1:7101/about")).toBe(true);
    expect(guards.onWindowOpen("http://127.0.0.1:7101/")).toEqual({ action: "deny" });
    expect(opened).toEqual([]);
  });

  it("其他协议一律拦下，不交给系统（mailto:、runyard://、file:）；服务端重定向到外部也只拦下", () => {
    const opened: string[] = [];
    const guards = createNavigationGuards((address) => opened.push(address));
    for (const address of ["mailto:a@b.c", "runyard://open/x", "file:///etc/passwd", "nope"]) {
      expect(decideNavigation(address)).toBe("block");
      expect(guards.onWillNavigate(address)).toBe(false);
      expect(guards.onWindowOpen(address)).toEqual({ action: "deny" });
    }
    expect(guards.onWillRedirect("https://example.com/")).toBe(false);
    expect(guards.onWillRedirect("http://127.0.0.1:7101/next")).toBe(true);
    expect(opened).toEqual([]);
  });

  it("[DESKTOP-LINKS-13] 预览页里点的 runyard:// 链接交给应用的链接处理，页面本身不跳转；别的协议不会走这条路", () => {
    const links: string[] = [];
    const guards = createNavigationGuards(
      () => {},
      (address) => links.push(address),
    );
    expect(guards.onWillNavigate("runyard://new/html")).toBe(false);
    expect(guards.onWindowOpen("runyard://open/demo")).toEqual({ action: "deny" });
    expect(guards.onWillNavigate("mailto:a@b.c")).toBe(false);
    expect(guards.onWillNavigate("file:///etc/passwd")).toBe(false);
    // 服务端重定向不是用户点的链接，不当作链接请求
    expect(guards.onWillRedirect("runyard://new/html")).toBe(false);
    expect(links).toEqual(["runyard://new/html", "runyard://open/demo"]);
  });
});
