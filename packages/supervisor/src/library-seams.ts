import type { PlaygroundSeed, PortSlotAllocator } from "@runyard/core";
import type { RunKind, TemplateDetail, TemplateRecord } from "@runyard/protocol";
import type { RunsView } from "./runs-view.ts";

/**
 * 模板那一侧：内置模板和用户模板的登记、变量替换、运行器类别。模板各 issue（#50 起）实现；
 * 错误用 methodFailure 抛（TEMPLATE_NOT_FOUND、TEMPLATE_INVALID、VAR_INVALID）。
 * 没有提供时，模板列表为空，创建任何模板都是 TEMPLATE_NOT_FOUND。
 */
export interface TemplateCatalog {
  list(): Promise<readonly TemplateRecord[]>;
  get(id: string): Promise<TemplateDetail | undefined>;
  /** 把模板展开成创建一个项目需要的一切（文件已替换好变量、名称已代入） */
  seed(request: {
    readonly template: string;
    readonly name: string;
    readonly vars: Readonly<Record<string, string>>;
  }): Promise<PlaygroundSeed>;
  /** 运行器的类别；找不到运行器时 undefined */
  runnerKind(runner: string): RunKind | undefined;
}

/** 资源库方法依赖的、由别的 issue 实现的几处；全部可省，经 `SupervisorExtensions.library` 接入 */
export interface LibrarySeams {
  /** 运行编排（#40） */
  runs?: RunsView;
  /** 模板（模板各 issue） */
  templates?: TemplateCatalog;
  /** 端口槽位（#36）；没有时新项目没有端口 */
  ports?: PortSlotAllocator;
}
