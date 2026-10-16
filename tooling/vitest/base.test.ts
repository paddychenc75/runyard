import { describe, expect, it } from "vitest";
import {
  createConfig,
  PLATFORM_DEPENDENT_GLOB,
  PROCESS_HOOK_TIMEOUT_MS,
  PROCESS_TEST_TIMEOUT_MS,
} from "./base.ts";

interface ProjectLike {
  extends?: boolean;
  test: {
    name: string;
    include: string[];
    exclude: string[];
    fileParallelism?: boolean;
    maxWorkers?: number;
    testTimeout?: number;
    hookTimeout?: number;
    setupFiles?: string[];
  };
}

function projects(host: string): Record<"unit" | "process", ProjectLike["test"]> {
  const list = (createConfig(host).test?.projects ?? []) as unknown as ProjectLike[];
  const byName = Object.fromEntries(list.map((project) => [project.test.name, project.test]));
  return byName as Record<"unit" | "process", ProjectLike["test"]>;
}

describe("共用 Vitest 配置：两个阶段", () => {
  it.each(["win32", "darwin", "linux"])("%s：单元阶段永远排除 platform-dependent 文件", (host) => {
    const unit = projects(host).unit;
    expect(unit.exclude).toContain(PLATFORM_DEPENDENT_GLOB);
    expect(unit.include).toEqual(["**/*.test.{ts,tsx}"]);
  });

  it.each(["darwin", "linux"])("%s：进程阶段只收 platform-dependent 文件", (host) => {
    const processPhase = projects(host).process;
    expect(processPhase.include).toEqual([PLATFORM_DEPENDENT_GLOB]);
    expect(processPhase.exclude).not.toContain(PLATFORM_DEPENDENT_GLOB);
  });

  it("Windows 上进程阶段没有任何文件，并允许一个包因此没有测试", () => {
    expect(projects("win32").process.include).toEqual([]);
    expect(createConfig("win32").test?.passWithNoTests).toBe(true);
  });

  it.each(["darwin", "linux"])("%s 上没有测试仍然算失败", (host) => {
    expect(createConfig(host).test?.passWithNoTests).toBe(false);
  });

  it("进程阶段有界并发：一个工作进程、一次一个文件，超时只在这里定一处", () => {
    const processPhase = projects("darwin").process;
    expect(processPhase.fileParallelism).toBe(false);
    expect(processPhase.maxWorkers).toBe(1);
    expect(processPhase.testTimeout).toBe(PROCESS_TEST_TIMEOUT_MS);
    expect(processPhase.hookTimeout).toBe(PROCESS_HOOK_TIMEOUT_MS);
  });

  it("单元阶段不限制并发，也不改默认超时", () => {
    const unit = projects("darwin").unit;
    expect(unit.fileParallelism).toBeUndefined();
    expect(unit.maxWorkers).toBeUndefined();
    expect(unit.testTimeout).toBeUndefined();
  });

  it("只有进程阶段装遗留进程守卫，两个阶段都装隔离名单", () => {
    const { unit, process: processPhase } = projects("darwin");
    expect(unit.setupFiles ?? []).toEqual([]);
    expect(processPhase.setupFiles?.some((file) => file.endsWith("process-guard.setup.ts"))).toBe(
      true,
    );
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
