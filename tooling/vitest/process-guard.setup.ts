import { afterAll } from "vitest";
import { reapSpawned } from "./spawned-registry.ts";

// 进程测试阶段每个测试文件结束后的兜底：登记过的进程不许有活着的。
// 遗留的进程会被结束（核对过身份），并让“泄漏它的这个文件”失败，而不是拖慢后面的测试。
afterAll(async () => {
  const leaked = await reapSpawned();
  if (leaked.length > 0) {
    throw new Error(
      `测试文件结束时仍有进程活着（pid ${leaked.join("、")}）：已结束它们。找出是哪个测试起了它又没有收尾，在测试的收尾里停掉。见 docs/guides/testing.md。`,
    );
  }
});
