import { z } from "zod";
import type { MethodDefinition } from "./method-definition.ts";
import { emptySchema, playgroundRefSchema } from "./primitives.ts";
import { settingsPatchSchema, settingsSchema } from "./settings.ts";
import { toolchainReportSchema } from "./tool-check.ts";

// 工具链组和设置组（规格 toolchain/detection）。
// 模板组（template.*）和自动清理组（clean.*）要等各自的规格批准后再登记。

export const toolchainMethods = {
  "toolchain.check": {
    group: "toolchain",
    summary: "检查一个项目或一个模板用得到的工具；cachedOnly 为 true 时只读缓存，不触发检测",
    params: z.object({
      playground: playgroundRefSchema.optional(),
      template: z.string().min(1).optional(),
      cachedOnly: z.boolean().optional(),
    }),
    result: toolchainReportSchema,
    errors: ["PLAYGROUND_NOT_FOUND", "TEMPLATE_NOT_FOUND"],
    status: "defined",
  },
  "toolchain.doctor": {
    group: "toolchain",
    summary: "检测全部已知工具",
    params: emptySchema,
    result: toolchainReportSchema,
    errors: [],
    status: "defined",
  },
  "toolchain.recheck": {
    group: "toolchain",
    summary: "清缓存、重新解析登录环境并重新检测",
    params: emptySchema,
    result: toolchainReportSchema,
    errors: [],
    status: "defined",
  },
  "toolchain.setPath": {
    group: "toolchain",
    summary: "手动指定一个工具的路径，排在所有自动查找之前，并重新检测",
    params: z.object({ tool: z.string().min(1), path: z.string().min(1) }),
    result: toolchainReportSchema,
    errors: ["DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
  "settings.get": {
    group: "settings",
    summary: "取设置",
    params: emptySchema,
    result: settingsSchema,
    errors: [],
    status: "defined",
  },
  "settings.set": {
    group: "settings",
    summary: "改设置：只传要改的字段，返回改后的全部设置",
    params: settingsPatchSchema,
    result: settingsSchema,
    errors: ["DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
