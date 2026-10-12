import { z } from "zod";
import { runKindSchema } from "./enums.ts";
import { defineFileFormat } from "./file-format.ts";
import { relativePathSchema } from "./primitives.ts";
import { templateIdSchema, toolIdSchema } from "./template-file.ts";

// runner.json（规格 templates/format 的“运行器的字段和按类别的约束”；
// 技术设计 §4.4；docs/architecture/runner-format.md）。运行器是随应用发布的数据，
// 模板只通过 runner 字段引用它。这里只定形状；按类别的约束和命令的写法规则在 validate-runner.ts，
// 因为 zod 在结构有错时会跳过整体检查，而 lint 要一次报全。

export const RUNNER_FORMAT_VERSION = 1;

// 命令是字符串数组，不是一整行（规格 TEMPLATES-FORMAT-18）。第一个元素是工具名时，
// 运行时换成检测到的真实路径；{port}、{entry}、{dir}、{name} 按元素替换
export const runnerCommandSchema = z.array(z.string().min(1)).min(1);
export type RunnerCommand = z.infer<typeof runnerCommandSchema>;

export const commandPlaceholders = ["{port}", "{entry}", "{dir}", "{name}"] as const;

// 安装输出的特征匹配到哪个原因；没有匹配任何一条就是 SETUP_FAILED（规格 TEMPLATES-FORMAT-16）
export const setupErrorReasons = ["DEPS_OFFLINE", "RUNTIME_MISSING", "SETUP_FAILED"] as const;
export const setupErrorReasonSchema = z.enum(setupErrorReasons);
export type SetupErrorReason = z.infer<typeof setupErrorReasonSchema>;

function isRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}
const regexSource = z.string().min(1).refine(isRegex, "must be a valid regular expression");

export const runnerSetupSchema = z.strictObject({
  inputs: z.array(relativePathSchema).min(1).describe("这些文件没变且 stamp 文件在就跳过安装"),
  stamp: relativePathSchema,
  variants: z
    .record(toolIdSchema, z.strictObject({ command: runnerCommandSchema }))
    .refine((variants) => Object.keys(variants).length > 0, "give at least one variant")
    .describe("按包管理器区分的安装命令，键是包管理器的工具标识"),
  errors: z
    .array(z.strictObject({ match: regexSource, reason: setupErrorReasonSchema }))
    .default([])
    .describe("输出特征到原因；对启动阶段的输出同样生效"),
});

export const runnerCheckSchema = z.strictObject({
  command: runnerCommandSchema,
  timeoutMs: z.number().int().positive().optional(),
});

export const runnerRunSchema = z.strictObject({
  command: runnerCommandSchema,
  env: z.record(z.string().min(1), z.string()).optional().describe("叠在全局环境之上"),
  stdin: z.boolean().optional().describe("脚本是否接收标准输入，缺省为否"),
});

// 就绪判断三选一（规格 templates/format）。port、log 的写法规格没定字段，这里的形状是本包选的
const slowAfterMs = z.number().int().positive().default(30000);
export const runnerReadySchema = z.union([
  z.strictObject({
    http: z.strictObject({ path: z.string().startsWith("/").default("/") }),
    slowAfterMs,
  }),
  z.strictObject({ port: z.strictObject({}), slowAfterMs }),
  z.strictObject({ log: z.strictObject({ match: regexSource }), slowAfterMs }),
]);
export type RunnerReady = z.infer<typeof runnerReadySchema>;

export const runnerPreviewTypes = ["web", "request", "console"] as const;
export const runnerPreviewSchema = z.strictObject({
  type: z.enum(runnerPreviewTypes),
  path: z.string().startsWith("/").optional(),
});

// none 框架自己热更新；rerun 脚本重跑，只用于 oneshot；restart 服务由管理进程停了再起，只用于 server
export const runnerWatchModes = ["none", "rerun", "restart"] as const;
export const runnerWatchSchema = z.strictObject({
  mode: z.enum(runnerWatchModes),
  paths: z.array(z.string().min(1)).optional(),
  ignore: z.array(z.string().min(1)).optional(),
  debounceMs: z.number().int().positive().optional(),
});

// 停止方式只写 mode 和 graceMs，不写信号名：接口里没有信号，手段由平台层定（决策记录 0006）
export const runnerStopModes = ["graceful", "interrupt"] as const;
export const DEFAULT_GRACE_MS = 2000;
export const runnerStopSchema = z.strictObject({
  mode: z.enum(runnerStopModes),
  graceMs: z.number().int().positive().default(DEFAULT_GRACE_MS),
});

// needs：工具名，或 anyOf 表示任选其一。版本范围不写在这里，写在模板的 requires
export const runnerNeedSchema = z.union([
  toolIdSchema,
  z.strictObject({ anyOf: z.array(toolIdSchema).min(1) }),
]);
export type RunnerNeed = z.infer<typeof runnerNeedSchema>;

export const runnerSchema = z.strictObject({
  formatVersion: z.literal(RUNNER_FORMAT_VERSION),
  id: templateIdSchema,
  kind: runKindSchema,
  needs: z.array(runnerNeedSchema),
  setup: runnerSetupSchema.optional(),
  check: runnerCheckSchema.optional(),
  run: runnerRunSchema.optional(),
  ready: runnerReadySchema.optional(),
  preview: runnerPreviewSchema,
  watch: runnerWatchSchema,
  stop: runnerStopSchema,
  // 第一版接受但忽略，为以后留着（规格 TEMPLATES-FORMAT-17）
  detect: z.unknown().optional(),
  actions: z.unknown().optional(),
});
export type Runner = z.infer<typeof runnerSchema>;

export const runnerFileFormat = defineFileFormat({
  name: "runner.json",
  currentVersion: RUNNER_FORMAT_VERSION,
  schema: runnerSchema,
  migrations: {},
  recovery: "skip",
});

// 安装输出归到哪个原因：按顺序找第一条匹配的特征，都不匹配就是 SETUP_FAILED（规格 TEMPLATES-FORMAT-16）。
// 管理进程对启动阶段的输出也用同一个函数（RUNTIME_MISSING 多半出现在启动时）
export function classifySetupFailure(
  errors: readonly { match: string; reason: SetupErrorReason }[],
  output: string,
): SetupErrorReason {
  for (const entry of errors) if (new RegExp(entry.match).test(output)) return entry.reason;
  return "SETUP_FAILED";
}
