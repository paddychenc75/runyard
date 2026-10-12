import { describe, expect, it } from "vitest";
import { createConfig, PLATFORM_DEPENDENT_GLOB } from "./base.ts";

describe("共用 Vitest 配置：平台相关测试的跳过机制", () => {
  it("Windows 上排除 platform-dependent 文件，并允许一个包因此没有测试", () => {
    const test = createConfig("win32").test;
    expect(test?.exclude).toContain(PLATFORM_DEPENDENT_GLOB);
    expect(test?.passWithNoTests).toBe(true);
  });

  it.each(["darwin", "linux"])("%s 上不排除，没有测试仍然算失败", (host) => {
    const test = createConfig(host).test;
    expect(test?.exclude).not.toContain(PLATFORM_DEPENDENT_GLOB);
    expect(test?.passWithNoTests).toBe(false);
  });

  it("所有系统都不重试", () => {
    for (const host of ["win32", "darwin", "linux"]) {
      expect(createConfig(host).test?.retry).toBe(0);
    }
  });

  it("标记的后缀能匹配契约测试文件，不匹配普通测试", () => {
    expect(PLATFORM_DEPENDENT_GLOB).toBe("**/*.platform-dependent.test.ts");
  });
});
