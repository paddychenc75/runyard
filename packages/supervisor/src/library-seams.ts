import type { PortSlotAllocator, TemplateCatalog } from "@runyard/core";
import type { RunsView } from "./runs-view.ts";

/** 资源库方法依赖的、由别的 issue 实现的几处；全部可省，经 `SupervisorExtensions.library` 接入 */
export interface LibrarySeams {
  /** 运行编排（#40） */
  runs?: RunsView;
  /** 模板（模板各 issue） */
  templates?: TemplateCatalog;
  /** 端口槽位（#36）；没有时新项目没有端口 */
  ports?: PortSlotAllocator;
}
