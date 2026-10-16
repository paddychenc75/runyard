import type { RunKind } from "@runyard/protocol";
import type { PortSlotAllocator } from "../library/library-types.ts";
import { DEFAULT_PORT_RANGE, type PortRange } from "./port-range.ts";

// 创建项目时分配端口槽位（规格 RUN-PORTS-01 到 04）：范围内没登记过的最小端口。
// 只看索引里的登记，不试绑定：登记是“这个项目的端口”，此刻有没有别的程序占着是启动时才处理的事（回退）。
// 脚本没有端口，返回 null；运行器的种类由装配方告诉我们。

export type PortSlotAllocatorDeps = {
  /** 每次分配时现读，设置里改了范围后立刻生效，已有项目登记的端口不变（RUN-PORTS-04） */
  readonly range?: () => PortRange;
  /** 运行器 id 到种类；不认识的运行器按有端口处理 */
  readonly runnerKind: (runner: string) => RunKind | undefined;
};

export function createPortSlotAllocator(deps: PortSlotAllocatorDeps): PortSlotAllocator {
  return {
    async allocate({ runner, taken }) {
      if (deps.runnerKind(runner) === "oneshot") return null;
      const { min, max } = deps.range?.() ?? DEFAULT_PORT_RANGE;
      for (let port = min; port <= max; port += 1) {
        if (!taken.has(port)) return port;
      }
      // 范围用完是配置问题，不能悄悄返回“没有端口”：那会让服务项目永远起不来
      throw new Error(`port range ${min}-${max} is exhausted`);
    },
  };
}
