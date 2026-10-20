import type { MessageKey, Messages, MessageValues, ValuesArgs } from "@runyard/i18n";
import type { NotificationText } from "./notification-store.ts";

/** 延迟翻译：保留编译期的键/参数校验，存储事实，显示时再用当前语言。 */
export function notificationText<K extends MessageKey>(
  key: K,
  ...args: ValuesArgs<Messages[K]>
): NotificationText {
  return { key, ...(args.length ? { values: args[0] as MessageValues } : {}) };
}
