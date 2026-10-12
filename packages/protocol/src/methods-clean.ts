import { z } from "zod";
import type { MethodDefinition } from "./method-definition.ts";
import { emptySchema } from "./primitives.ts";

// 自动清理组（规格 library/auto-clean；技术设计 §4.7）。判断是 core 里的纯函数，
// 调度在桌面应用主进程；这里只有它要调用的三个方法。清理本身走 playground.trash，
// 与命令行的 rm 同一条路径，所以没有单独的“执行清理”方法。

const playgroundId = z.string().min(1);

export const cleanMethods = {
  "clean.due": {
    group: "clean",
    summary:
      "按当前时间判断：待提醒的和可清理的项目 id。已保留、找不到文件夹的不在其中；资源库根目录不在时两份都是空的",
    params: emptySchema,
    result: z.object({
      remind: z.array(playgroundId).describe("待提醒清单：离到期不足 24 小时、提醒还没显示过"),
      clean: z.array(playgroundId).describe("可清理清单：已到期且提醒已显示满 24 小时"),
    }),
    errors: [],
    status: "defined",
  },
  "clean.ackReminder": {
    group: "clean",
    summary: "界面确认提醒真的显示了，记下显示时间；之后不再进入待提醒清单",
    params: z.object({ playgroundId }),
    result: emptySchema,
    errors: ["PLAYGROUND_NOT_FOUND", "DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
  "clean.keep": {
    group: "clean",
    summary: "提醒里的“改为保留”：项目变为已保留，提醒状态清除",
    params: z.object({ playgroundId }),
    result: emptySchema,
    errors: ["PLAYGROUND_NOT_FOUND", "DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
