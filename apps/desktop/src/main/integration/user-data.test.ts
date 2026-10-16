import { describe, expect, it } from "vitest";
import { resolveUserDataDir } from "./user-data.ts";

describe("resolveUserDataDir", () => {
  it("开发与正式用不同的目录，都不是默认的 Electron", () => {
    const dev = resolveUserDataDir({ appData: "/a", packaged: false, root: undefined });
    const prod = resolveUserDataDir({ appData: "/a", packaged: true, root: undefined });
    expect(dev).toBe("/a/Runyard-dev");
    expect(prod).toBe("/a/Runyard");
  });

  it("指定了 --root 时放进该目录，不碰真实的应用数据", () => {
    expect(resolveUserDataDir({ appData: "/a", packaged: false, root: "/tmp/r" })).toBe(
      "/tmp/r/.runyard/app-data",
    );
  });
});
