import type { ErrorCode, ErrorParams, NoticeCode, NoticeParams, RunState } from "@runyard/protocol";
import type { CatalogMessages } from "../generated/messages";

// 键 → 参数类型。两部分：
// 1. 错误码、提示码、运行状态三族由 protocol 的登记表在类型层推出（登记一次，这里自动跟上）；
// 2. 其余键由 `pnpm i18n:build` 从中文文案生成（generated/messages.d.ts）。

export type ErrorMessageField = "title" | "body" | "hint" | "hintCli";

type NoParams = Record<never, never>;

export type CodeMessages = {
  [C in ErrorCode as `errors.${C}.${ErrorMessageField}`]: ErrorParams<C>;
} & {
  [C in NoticeCode as `notice.${C}`]: NoticeParams<C>;
} & {
  [S in RunState as `runState.${S}`]: NoParams;
};

export type Messages = CodeMessages & CatalogMessages;

export type MessageMap = { readonly [key: string]: object };
export type MessageKey<P extends MessageMap = Messages> = keyof P & string;

// 没有参数的键不用传第二个实参；有参数的键必须传，漏一个就是类型错误。
// zod 把空对象 z.object({}) 推成 Record<string, never>，它的键是 string 而不是 never，所以单独认
export type ValuesArgs<V> = keyof V extends never
  ? []
  : string extends keyof V
    ? [values?: V]
    : [values: V];
