import { describe, expect, it } from "vitest";
import { isAppUrl, resolveAppFile } from "./app-protocol.ts";

const dir = "/dist/renderer";

describe("resolveAppFile", () => {
  it("根路径对应 index.html，其他路径对应界面目录里的文件", () => {
    expect(resolveAppFile(dir, "app://runyard/")).toBe("/dist/renderer/index.html");
    expect(resolveAppFile(dir, "app://runyard/main.js")).toBe("/dist/renderer/main.js");
  });

  it("跳出界面目录的路径一律拒绝", () => {
    // 编码过的斜杠不会被地址解析器折叠，解码后才出现 ..，这是守卫真正要拦的
    expect(resolveAppFile(dir, "app://runyard/..%2fpreload%2findex.cjs")).toBeNull();
    expect(resolveAppFile(dir, "app://runyard/%2e%2e%2f%2e%2e%2fsecret")).toBeNull();
  });

  it("地址解析器已折叠的 .. 不会让路径落到界面目录之外", () => {
    expect(resolveAppFile(dir, "app://runyard/../preload/index.cjs")).toBe(
      "/dist/renderer/preload/index.cjs",
    );
    expect(resolveAppFile(dir, "app://runyard//etc/passwd")).toBe("/dist/renderer/etc/passwd");
  });

  it("别的主机、别的协议、乱写的地址都拒绝", () => {
    expect(resolveAppFile(dir, "app://evil/main.js")).toBeNull();
    expect(resolveAppFile(dir, "http://runyard/main.js")).toBeNull();
    expect(resolveAppFile(dir, "not a url")).toBeNull();
  });
});

describe("isAppUrl", () => {
  it("只认本应用自己的界面页面", () => {
    expect(isAppUrl("app://runyard/")).toBe(true);
    expect(isAppUrl("app://runyard/index.html")).toBe(true);
    expect(isAppUrl("app://runyardx/")).toBe(false);
    expect(isAppUrl("http://127.0.0.1:7101/")).toBe(false);
    expect(isAppUrl("")).toBe(false);
  });
});
