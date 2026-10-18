import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 应用报出的版本号来自 apps/desktop/package.json（开发时 app.getVersion() 读它，打包时 pack.ts 把它抄进应用目录）。
// release-please 只改根目录的版本，不登记这个文件它就永远是 0.0.0，更新提示会写“你现在用的是 0.0.0”（#421）。

const readJson = (relative: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as Record<string, unknown>;

describe("应用版本号随发版更新", () => {
  it("[DESKTOP-SETTINGS-33] 发版工具把 apps/desktop/package.json 的 version 登记为要一起改的文件", () => {
    const config = readJson("../../../release-please-config.json") as {
      packages: Record<string, { "extra-files"?: unknown[] }>;
    };
    expect(config.packages["."]?.["extra-files"]).toContainEqual({
      type: "json",
      path: "apps/desktop/package.json",
      jsonpath: "$.version",
    });
  });

  it("[DESKTOP-SETTINGS-33] 应用的 package.json 有可比较的三段版本号", () => {
    expect(readJson("../package.json").version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
