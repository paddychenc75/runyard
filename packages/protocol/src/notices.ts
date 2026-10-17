import { z } from "zod";
import { portFallbackReasonSchema } from "./enums.ts";

// 提示码登记表：管理进程插进日志或工作区的结构化提示，只有代码加参数（技术设计 §5.1）。
// 文案键 notice.<代码> 由代码推出。发布后不改名、不复用。

const port = z.number().int().min(1).max(65535);
const none = z.object({});

export const noticeRegistry = {
  RELOADING: { params: none },
  STOPPED_BY_USER: { params: none },
  // 进程自己退出；两个字段都给出现场，signal 是名字，不是句子
  PROCESS_EXITED: {
    params: z.object({
      exitCode: z.number().int().optional(),
      signal: z.string().min(1).optional(),
    }),
  },
  DEPS_FROM_CACHE: { params: none },
  PORT_FALLBACK: {
    params: z.object({ wanted: port, actual: port, reason: portFallbackReasonSchema }),
  },
  // 没能读取登录环境：先用扫描结果顶着（技术设计 §4.8）。reason 区分“超时”和“失败”
  ENV_UNRESOLVED: { params: z.object({ reason: z.enum(["timeout", "failed"]) }) },
  // 只读到非交互登录环境；来源固定是 login-shell-degraded，不用参数重复
  ENV_DEGRADED: { params: none },
  // 空闲自动停止的日志行（技术设计 §4.6）
  IDLE_STOPPED: { params: z.object({ minutes: z.number().int().positive() }) },
  // 没有首选的包管理器而改用另一个（技术设计的“回退提示”）
  PACKAGE_MANAGER_FALLBACK: {
    params: z.object({ wanted: z.string().min(1), used: z.string().min(1) }),
  },
  // 资源库路径加名称接近系统路径长度上限，创建仍然进行（规格 LIBRARY-PLAYGROUNDS-05）。
  // length 是项目路径的字符数，limit 是当前系统的上限，由平台层给出
  PATH_NEAR_LIMIT: {
    params: z.object({ length: z.number().int().positive(), limit: z.number().int().positive() }),
  },
  // 另一个构建的命令行连上时，管理进程被桌面应用占着，没有被换新（规格 CLI-COMMANDS-87）。
  // 由命令行自己在连接结果里生成，不是管理进程发的
  SUPERVISOR_IN_USE_BY_APP: { params: none },
  // 停止后端口在上限内仍不能重新绑定，stop 照常返回（规格 RUN-LIFECYCLE-14；技术设计 §5.3）。
  // waitedMs 是实际等了多久，limitMs 是上限（3000）；下次启动若仍被占用，按端口回退规则换一个
  PORT_NOT_RELEASED: {
    params: z.object({
      port,
      waitedMs: z.number().int().nonnegative(),
      limitMs: z.number().int().positive(),
    }),
  },
  // 工具版本高于模板声明的上限，照常运行但未经测试（规格 TOOLCHAIN-DETECTION-09）
  TOOL_VERSION_UNTESTED: {
    params: z.object({
      tool: z.string().min(1),
      found: z.string().min(1),
      required: z.string().min(1),
    }),
  },
} as const;

export type NoticeCode = keyof typeof noticeRegistry;
export type NoticeParams<C extends NoticeCode> = z.infer<(typeof noticeRegistry)[C]["params"]>;

export const noticeCodes = Object.keys(noticeRegistry) as NoticeCode[];

export type Notice<C extends NoticeCode = NoticeCode> = {
  [K in C]: { code: K; params: NoticeParams<K> };
}[C];

const variants = noticeCodes.map((code) =>
  z.object({ code: z.literal(code), params: noticeRegistry[code].params }),
);

// 断言的原因同 errors.ts
export const noticeSchema = (
  z.discriminatedUnion(
    "code",
    variants as unknown as [(typeof variants)[number], ...(typeof variants)[number][]],
  ) as unknown as z.ZodType<Notice>
).meta({ id: "Notice" });
