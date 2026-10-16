import type { RunKind } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { createPortSlotAllocator } from "./port-slot-allocator.ts";

const kinds: Record<string, RunKind> = { vite: "server", "python-file": "oneshot" };
const request = (taken: number[], runner = "vite") => ({
  playgroundId: "pg",
  runner,
  taken: new Set(taken),
});

describe("端口槽位", () => {
  const allocator = createPortSlotAllocator({ runnerKind: (runner) => kinds[runner] });

  it("[RUN-PORTS-01] 第一个服务项目得到默认范围内最小端口 7100", async () => {
    expect(await allocator.allocate(request([]))).toBe(7100);
  });

  it("[RUN-PORTS-02] 7100 已登记时，下一个得到 7101；登记里的空洞被先填上", async () => {
    expect(await allocator.allocate(request([7100]))).toBe(7101);
    expect(await allocator.allocate(request([7100, 7102]))).toBe(7101);
  });

  it("[RUN-PORTS-03] 脚本类运行器没有端口", async () => {
    expect(await allocator.allocate(request([], "python-file"))).toBeNull();
  });

  it("[RUN-PORTS-04] 范围改成 8000 到 8099 后新项目得到 8000，已登记的不动", async () => {
    let range = { min: 7100, max: 7999 };
    const live = createPortSlotAllocator({ range: () => range, runnerKind: (r) => kinds[r] });
    expect(await live.allocate(request([7100]))).toBe(7101);
    range = { min: 8000, max: 8099 };
    expect(await live.allocate(request([7100]))).toBe(8000);
  });

  it("范围用完时报错，不悄悄当作没有端口", async () => {
    const tiny = createPortSlotAllocator({
      range: () => ({ min: 7100, max: 7101 }),
      runnerKind: () => "server",
    });
    await expect(tiny.allocate(request([7100, 7101]))).rejects.toThrow("exhausted");
  });
});
