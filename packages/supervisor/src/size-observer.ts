import { isActiveState } from "@runyard/core";
import type { RunObserver } from "./run-module.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 依赖安装步骤结束（成功或失败）和一次运行结束之后，项目的磁盘占用要重算（规格 LIBRARY-DISK-USAGE-16）：
// 依赖目录不在文件监听范围内，装依赖不会被文件变化发现。
export function createSizeObserver(api: SupervisorApi): Required<Pick<RunObserver, "state">> {
  return {
    state: ({ run, previous }) => {
      if (previous === "installing" || !isActiveState(run.state)) api.refreshSize(run.playgroundId);
    },
  };
}
