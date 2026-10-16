import type { PlaygroundSeed, PortSlotAllocator } from "@runyard/core";
import type { RunKind } from "@runyard/protocol";
import type { RunsView } from "./runs-view.ts";

/**
 * 模板那一侧还没有人实现的部分：展开成项目（变量替换）和运行器类别。模板各 issue（#50 起）实现；
 * 错误用 methodFailure 抛（TEMPLATE_NOT_FOUND、TEMPLATE_INVALID、VAR_INVALID）。
 * 模板的列出、查看、另存为不在这里：管理进程自己读模板文件夹（template-library.ts）。
 * 没有提供时，创建任何模板都是 TEMPLATE_NOT_FOUND。
 */
export interface TemplateCatalog {
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
