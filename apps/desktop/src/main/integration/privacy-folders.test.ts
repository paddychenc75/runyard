import { describe, expect, it } from "vitest";
import { isInPrivacyProtectedFolder } from "./privacy-folders.ts";

describe("“桌面”“文档”“下载”的隐私保护判断", () => {
  const home = "/Users/me";
  it("[DESKTOP-SETTINGS-05] 这三个文件夹本身和它们里面的任何位置都算", () => {
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Documents")).toBe(true);
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Documents/Runyard")).toBe(true);
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Desktop/a/b")).toBe(true);
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Downloads/")).toBe(true);
  });

  it("主目录本身、别的文件夹、名字只是前缀相同的文件夹、别人主目录里的同名文件夹都不算", () => {
    expect(isInPrivacyProtectedFolder(home, "/Users/me")).toBe(false);
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Runyard")).toBe(false);
    expect(isInPrivacyProtectedFolder(home, "/Users/me/Documents2/x")).toBe(false);
    expect(isInPrivacyProtectedFolder(home, "/Users/you/Documents")).toBe(false);
  });
});
