import { describe, expect, it } from "vitest";
import { isLocalPreviewUrl, isPermissionAllowed } from "./preview-policy.ts";

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
