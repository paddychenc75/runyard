import type { ToolchainService } from "@runyard/core";
import type { HandlerMap } from "./dispatch.ts";
import { methodFailure } from "./method-failure.ts";
import type { TemplateLibrary } from "./template-library.ts";

// 工具链组里目前接上的一个方法：toolchain.check 按模板查（规格 toolchain/detection）。
// cachedOnly 只读缓存、不起任何进程：桌面应用的模板详情靠它显示“这台电脑上的版本”，
// 打开详情不能触发检测（规格 DESKTOP-TEMPLATES-VIEW-04）。按项目查、doctor、recheck、setPath 随后续 issue。

export function createToolchainHandlers(
  templates: TemplateLibrary,
  toolchain: () => Promise<ToolchainService> | undefined,
): HandlerMap {
  return {
    "toolchain.check": async (params) => {
      const service = await toolchain();
      if (service === undefined || params.template === undefined) {
        throw methodFailure("NOT_SUPPORTED", {}, "toolchain.check supports only { template }");
      }
      const detail = await templates.get(params.template);
      if (detail === undefined) {
        throw methodFailure(
          "TEMPLATE_NOT_FOUND",
          { template: params.template },
          `no template ${params.template}`,
        );
      }
      const result = await service.check({
        requires: detail.template.requires,
        ...(params.cachedOnly === true ? { cachedOnly: true } : {}),
      });
      return { tools: [...result.tools] };
    },
  };
}
