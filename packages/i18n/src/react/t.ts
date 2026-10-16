import { cloneElement, createElement, Fragment, type ReactElement, type ReactNode } from "react";
import type { MessageKey, MessageMap, Messages } from "../messages.ts";
import { useTranslator } from "./context.ts";

type AnyFunction = (...args: never[]) => unknown;

// 文案参数里，函数类型的是富文本标签（<code>…</code>），其余是普通参数
type PlainValues<V> = { [N in keyof V as V[N] extends AnyFunction ? never : N]: V[N] };
type TagNames<V> = {
  [N in keyof V]: V[N] extends AnyFunction ? N : never;
}[keyof V] &
  string;

export type TProps<K extends MessageKey<P>, P extends MessageMap = Messages> = {
  k: K;
} & (keyof PlainValues<P[K]> extends never
  ? { values?: undefined }
  : { values: PlainValues<P[K]> }) &
  ([TagNames<P[K]>] extends [never]
    ? { components?: undefined }
    : { components: Record<TagNames<P[K]>, ReactElement> });

/**
 * 带标签的文案：`<T k="create.folderHint" values={{ path }} components={{ code: <CodeText /> }} />`。
 * 标签里的内容成为组件的子节点；没有标签的文案直接用 `t()`，不用它。
 */
export function T<K extends MessageKey>(props: TProps<K>): ReactNode {
  const { rich } = useTranslator();
  const components = (props.components ?? {}) as Record<string, ReactElement>;
  const tags = Object.fromEntries(
    Object.entries(components).map(([name, element]) => [
      name,
      (chunks: ReactNode[]) => cloneElement(element, undefined, ...chunks),
    ]),
  );
  const parts = rich<ReactNode>(props.k, (props.values ?? {}) as never, tags);
  return createElement(Fragment, null, ...parts);
}
