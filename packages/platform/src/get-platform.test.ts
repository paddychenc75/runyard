import { describe, expect, it } from "vitest";
import { platformFor } from "./get-platform.ts";
import { absPath } from "./path-types.ts";
import { isPlatformError } from "./platform-error.ts";
import type { PlatformOptions } from "./platform-options.ts";

const options: PlatformOptions = {
  home: absPath(process.cwd()),
  arch: "arm64",
  profile: undefined,
};

describe("platformFor：选择实现", () => {
  it("darwin 和 linux 各给出自己的实现", () => {
    expect(platformFor("darwin", options).id).toBe("darwin");
    expect(platformFor("linux", options).id).toBe("linux");
  });

  it.each(["win32", "freebsd", "aix", ""])("不支持的系统 %j 报带代码的错误", (system) => {
    let thrown: unknown;
    try {
      platformFor(system, options);
    } catch (error) {
      thrown = error;
    }
    expect(isPlatformError(thrown)).toBe(true);
    expect(isPlatformError(thrown) && thrown.error.code).toBe("NOT_SUPPORTED");
  });
});

describe("开发版隔离（RUNYARD_PROFILE=dev）", () => {
  it("profile 为 dev 时数据目录带 -dev 后缀", () => {
    const dev = platformFor("darwin", { ...options, profile: "dev" });
    expect(dev.paths.stateDir.endsWith(".runyard-dev")).toBe(true);
    expect(dev.paths.defaultLibrary.endsWith("Runyard-dev")).toBe(true);
  });

  it("没有 profile 时用正式目录", () => {
    const prod = platformFor("linux", options);
    expect(prod.paths.stateDir.endsWith(".runyard")).toBe(true);
    expect(prod.paths.defaultLibrary.endsWith("Runyard")).toBe(true);
  });
});
