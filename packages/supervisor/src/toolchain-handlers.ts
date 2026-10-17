import type { ToolchainService } from "@runyard/core";
import type { Requires, ToolchainReport } from "@runyard/protocol";
import type { HandlerMap } from "./dispatch.ts";
import { methodFailure } from "./method-failure.ts";
import { type RunSubjects, requiresOf } from "./run-subjects.ts";
import type { SupervisorApi } from "./supervisor-api.ts";
import type { TemplateLibrary } from "./template-library.ts";

// toolchain.* 方法（规格 desktop/settings“运行环境”、toolchain/detection）。参数已按登记表校验。
// 工具检测服务本身在 run-module 里（和运行共用缓存与工具定义），这里只把它接到方法上。

export interface ToolchainHandlerDeps {
  readonly api: SupervisorApi;
  /** 检测服务由运行模块创建；没有（没装运行模块）时这些方法回 NOT_SUPPORTED */
  readonly toolchain: () => Promise<ToolchainService> | undefined;
  readonly templates: Pick<TemplateLibrary, "list" | "get">;
  /** 设置变了之后让检测服务用新的工具路径；没有就不刷新 */
  readonly refreshSettings?: () => Promise<void>;
}

/**
 * 全部有效模板用到的工具（设置页“运行环境”只列用到的，规格 DESKTOP-SETTINGS-15）。
 * 同一个工具各模板写的版本范围可能不同，取先遇到的那一个——表里只要显示“需要什么”，不做裁决
 */
async function requiresOfAllTemplates(
  templates: ToolchainHandlerDeps["templates"],
): Promise<Requires> {
  const merged: Requires = {};
  for (const record of await templates.list()) {
    if (!record.valid) continue;
    for (const [tool, requirement] of Object.entries(record.requires)) {
      merged[tool] ??= requirement;
    }
  }
  return merged;
}

export function createToolchainHandlers(deps: ToolchainHandlerDeps): HandlerMap {
  const { api } = deps;
  const report = (result: { tools: ToolchainReport["tools"] }): ToolchainReport => ({
    tools: [...result.tools],
  });
  // 检测服务在运行模块里；没有就回 NOT_SUPPORTED。每次用之前先让它读到最新的工具路径
  const service = async (): Promise<ToolchainService> => {
    const found = await deps.toolchain();
    if (found === undefined) {
      throw methodFailure("NOT_SUPPORTED", {}, "no toolchain service in this supervisor");
    }
    await deps.refreshSettings?.();
    return found;
  };

  return {
    // 按模板查（模板详情用，只读缓存时不起进程，规格 DESKTOP-TEMPLATES-VIEW-04）；
    // 什么都不给是全部有效模板用到的工具（设置页“运行环境”表，规格 DESKTOP-SETTINGS-15）；按项目查随后续 issue
    "toolchain.check": async (params) => {
      if (params.playground !== undefined) {
        throw methodFailure("NOT_SUPPORTED", {}, "toolchain.check does not support { playground }");
      }
      const toolchain = await service();
      let requires: Requires;
      if (params.template !== undefined) {
        const detail = await deps.templates.get(params.template);
        if (detail === undefined) {
          throw methodFailure(
            "TEMPLATE_NOT_FOUND",
            { template: params.template },
            `no template ${params.template}`,
          );
        }
        requires = detail.template.requires;
      } else {
        requires = await requiresOfAllTemplates(deps.templates);
      }
      return report(
        await toolchain.check({
          requires,
          ...(params.cachedOnly === true ? { cachedOnly: true } : {}),
        }),
      );
    },
    "toolchain.recheck": async () => {
      const result = report(await (await service()).recheck());
      api.publish("toolchain.changed", {});
      return result;
    },
    "toolchain.setPath": async ({ tool, path }) => {
      const toolchain = await service();
      if (!(await toolchain.verifyPath(tool, path))) {
        throw methodFailure(
          "TOOL_PATH_INVALID",
          { tool, path },
          `${path} did not print a ${tool} version`,
        );
      }
      const current = await api.readSettings();
      await api.updateSettings({ toolPaths: { ...current.toolPaths, [tool]: path } });
      await deps.refreshSettings?.();
      const result = report(await toolchain.doctor());
      api.publish("toolchain.changed", {});
      return result;
    },
  };
}
