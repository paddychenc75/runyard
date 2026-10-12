import { describe, expect, it } from "vitest";
import { type AbsPath, absPath } from "../path-types.ts";
import { isCloudSynced, isInUserFolders, type LocationRules } from "./locations.ts";

const home = absPath("/Users/me");
const rules: LocationRules = {
  home,
  caseInsensitive: true,
  cloudDirs: ["Library/Mobile Documents", "Library/CloudStorage", "Dropbox", "OneDrive*"],
  userFolders: ["Desktop", "Documents", "Downloads"],
};
const p = (value: string): AbsPath => absPath(value);

describe("isInUserFolders", () => {
  it("桌面、文档、下载及其子目录", () => {
    expect(isInUserFolders(p("/Users/me/Desktop"), rules)).toBe(true);
    expect(isInUserFolders(p("/Users/me/Documents/code/demo"), rules)).toBe(true);
    expect(isInUserFolders(p("/Users/me/Downloads/x"), rules)).toBe(true);
  });

  it("默认资源库和主目录下的别处不算", () => {
    expect(isInUserFolders(p("/Users/me/Runyard"), rules)).toBe(false);
    expect(isInUserFolders(p("/Users/me/Projects/Documents"), rules)).toBe(false);
    expect(isInUserFolders(p("/Users/me"), rules)).toBe(false);
  });

  it("名字只是以它开头的不算", () => {
    expect(isInUserFolders(p("/Users/me/Documents-old"), rules)).toBe(false);
    expect(isInUserFolders(p("/Users/me/Desktop2/x"), rules)).toBe(false);
  });

  it("默认卷不分大小写时，大小写不同也算", () => {
    expect(isInUserFolders(p("/Users/me/documents/x"), rules)).toBe(true);
    expect(isInUserFolders(p("/Users/me/documents/x"), { ...rules, caseInsensitive: false })).toBe(
      false,
    );
  });
});

describe("isCloudSynced", () => {
  it("iCloud 云盘和文件提供程序目录", () => {
    expect(
      isCloudSynced(p("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/x"), rules),
    ).toBe(true);
    expect(isCloudSynced(p("/Users/me/Library/CloudStorage/Dropbox/x"), rules)).toBe(true);
  });

  it("家目录下的 Dropbox 与以 OneDrive 开头的目录", () => {
    expect(isCloudSynced(p("/Users/me/Dropbox"), rules)).toBe(true);
    expect(isCloudSynced(p("/Users/me/OneDrive - Acme/demo"), rules)).toBe(true);
  });

  it("普通目录、主目录本身、主目录之外都不算", () => {
    expect(isCloudSynced(p("/Users/me/Runyard"), rules)).toBe(false);
    expect(isCloudSynced(p("/Users/me"), rules)).toBe(false);
    expect(isCloudSynced(p("/Volumes/Dropbox/x"), rules)).toBe(false);
    expect(isCloudSynced(p("/Users/me/Dropbox-old"), rules)).toBe(false);
  });
});
