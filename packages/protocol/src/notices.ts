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
    params: z.object({ exitCode: z.number().int().optional(), signal: z.string().optional() }),
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
