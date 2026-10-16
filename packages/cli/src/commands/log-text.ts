import { cliCatalogs, createTranslator, type Localized, type Messages } from "@runyard/i18n";
import type { LogEntry } from "@runyard/protocol";
import type { CommandContext } from "./command-context.ts";

// 把日志条目拼成文字：进程自己的输出原样（读取时的清洗在管理进程一侧），命令行是 `$ 命令`，
// 管理进程插入的提示（system 条目）按提示码和参数翻译。
// --json 的输出不随语言变，所以 --json 下提示永远用英文；给人看的才用当前语言。

type NoticeText = (key: string, values: unknown) => Localized;

function noticeText(context: CommandContext): NoticeText {
  const translate = context.global.json
    ? createTranslator<Messages>({
        platform: context.platform.id,
        catalogs: cliCatalogs,
        locale: "en",
      }).t
    : context.t;
  return translate as NoticeText;
}

export function logTextOf(context: CommandContext): (entries: readonly LogEntry[]) => string {
  const notice = noticeText(context);
  const line = (entry: LogEntry): string => {
    if (entry.kind === "system") {
      return notice(`notice.${entry.notice.code}`, entry.notice.params);
    }
    return entry.kind === "command" ? `$ ${entry.text}` : entry.text;
  };
  return (entries) => entries.map((entry) => `${line(entry)}\n`).join("");
}

/** 还没有运行时管理进程给的游标是 none:0（协议只保证形状 <运行 id>:<序号>）；对外是 null */
export function cursorOrNull(cursor: string): string | null {
  return cursor.startsWith("none:") ? null : cursor;
}
