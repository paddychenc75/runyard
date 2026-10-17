import { z } from "zod";
import type { MethodDefinition } from "./method-definition.ts";

// 只占名字的方法：设计已经列了名字，但形状或行为要等对应的规格批准后再定。
// 入参和出参现在什么都接受；管理进程回 NOT_SUPPORTED。改成 defined 时要写出真正的形状。

const anything = z.unknown();

export const reservedMethods = {
  "run.disown": {
    group: "run",
    summary: "以后的“在后台保持运行”，先留位置",
    params: anything,
    result: anything,
    errors: ["NOT_SUPPORTED"],
    status: "reserved",
  },
} as const satisfies Record<string, MethodDefinition>;
