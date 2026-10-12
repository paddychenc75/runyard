import { z } from "zod";
import { dataFileKindSchema } from "./enums.ts";

// 错误码登记表：一份定义同时给出类型、校验和退出码（技术设计 §5.1、§5.3）。
// 代码发布后不改名、不复用；新增代码不升协议版本。参数里只放可序列化的简单值，没有句子。

// 工具标识由模板的工具定义决定，是开放集合，所以这里只要求非空
const toolId = z.string().min(1);
const name = z.string().min(1);
const none = z.object({});

export const errorRegistry = {
  INTERNAL: { exit: 1, params: none },

  USAGE: { exit: 2, params: none },
  NAME_INVALID: { exit: 2, params: z.object({ name }) },
  NAME_RESERVED: { exit: 2, params: z.object({ name }) },
  VAR_INVALID: { exit: 2, params: z.object({ key: z.string().min(1) }) },

  PLAYGROUND_NOT_FOUND: { exit: 3, params: z.object({ name }) },
  TEMPLATE_NOT_FOUND: { exit: 3, params: z.object({ template: z.string().min(1) }) },
  FOLDER_MISSING: { exit: 3, params: z.object({ name }) },
  // 按 runId 找不到运行（run.stop / get / adopt / attach / detach）。runId 是调用方给的原样字符串
  RUN_NOT_FOUND: { exit: 3, params: z.object({ runId: z.string().min(1) }) },

  TOOL_MISSING: { exit: 4, params: z.object({ tool: toolId, required: z.string().min(1) }) },
  TOOL_TOO_OLD: {
    exit: 4,
    params: z.object({ tool: toolId, required: z.string().min(1), found: z.string().min(1) }),
  },
  RUNTIME_MISSING: { exit: 4, params: z.object({ tool: toolId }) },

  // 原始输出的末尾放在 cause.outputTail，不进参数
  SETUP_FAILED: { exit: 5, params: z.object({ name }) },
  DEPS_OFFLINE: { exit: 5, params: z.object({ name }) },

  RUN_FAILED: { exit: 6, params: z.object({ name }) },
  SCRIPT_ERRORED: { exit: 6, params: z.object({ name }) },

  READY_TIMEOUT: { exit: 7, params: z.object({ name, seconds: z.number().nonnegative() }) },

  NAME_EXISTS: { exit: 9, params: z.object({ name }) },
  BUSY: { exit: 9, params: z.object({ name }) },
  PATH_LOCKED: { exit: 9, params: z.object({ name }) },
  PATH_TOO_LONG: { exit: 9, params: z.object({ name }) },
  TRASH_UNAVAILABLE: { exit: 9, params: z.object({ name }) },

  APP_REQUIRED: { exit: 10, params: none },
  SUPERVISOR_UNAVAILABLE: { exit: 10, params: none },
  // runs：升级会停掉的运行个数（规格 PROTOCOL-HANDSHAKE-13）
  SUPERVISOR_OUTDATED: { exit: 10, params: z.object({ runs: z.number().int().nonnegative() }) },
  CLIENT_OUTDATED: { exit: 10, params: none },
  NOT_SUPPORTED: { exit: 10, params: none },
  // 要写的文件是更新版本的 Runyard 写的：读仍然允许（只读视图），写一律拒绝，不改写、不降级。
  // 与 CLIENT_OUTDATED 同属“要用户去升级才能继续”，所以也是 10。found 是文件里的版本，supported 是本程序认识的最高版本
  DATA_FROM_NEWER_VERSION: {
    exit: 10,
    params: z.object({
      file: dataFileKindSchema,
      found: z.number().int().positive(),
      supported: z.number().int().positive(),
    }),
  },
} as const;

export type ErrorCode = keyof typeof errorRegistry;
export type ErrorParams<C extends ErrorCode> = z.infer<(typeof errorRegistry)[C]["params"]>;

export const errorCodes = Object.keys(errorRegistry) as ErrorCode[];

export function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(errorRegistry, code);
}

// 进程的原始现场，原样显示，不翻译
export const errorCauseSchema = z.object({
  exitCode: z.number().int().optional(),
  signal: z.string().optional(),
  outputTail: z.string().optional(),
});
export type ErrorCause = z.infer<typeof errorCauseSchema>;

// 以 C 为参数收窄：RunyardError<"NAME_EXISTS"> 的 params 就是 { name: string }
export type RunyardError<C extends ErrorCode = ErrorCode> = {
  [K in C]: {
    code: K;
    params: ErrorParams<K>;
    // 一句英文诊断，只进日志；任何客户端都不许显示
    debug: string;
    cause?: ErrorCause;
  };
}[C];

const variants = errorCodes.map((code) =>
  z.object({
    code: z.literal(code),
    params: errorRegistry[code].params,
    debug: z.string(),
    cause: errorCauseSchema.optional(),
  }),
);

// discriminatedUnion 需要非空元组，动态生成的数组推不出类型，所以在这里断言一次；
// 结果类型由上面的 RunyardError 给出，两者的一致由 errors.test.ts 的逐码测试守着
export const runyardErrorSchema = z.discriminatedUnion(
  "code",
  variants as unknown as [(typeof variants)[number], ...(typeof variants)[number][]],
) as unknown as z.ZodType<RunyardError>;
