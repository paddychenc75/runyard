import type { Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import { LogView, type LogViewLine } from "@runyard/ui";
import { useMemo } from "react";
import type { ConsoleLine } from "../../shared/console-state.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { useConsoleLines } from "./use-console-lines.ts";

export interface ConsoleOutputProps {
  bridge: DesktopBridge;
  playground: string;
  className?: string;
}

type NoticeText = (key: string, values: unknown) => Localized;

// 一个项目的进程输出（规格 desktop/workspace「控制台显示进程输出」）：主进程留着、读取时清洗过的
// 行，这里只负责显示。进程自己的输出不翻译，管理进程插入的提示按提示码翻译。
export function ConsoleOutput({ bridge, playground, className }: ConsoleOutputProps) {
  const t = useT();
  const fmt = useFormat();
  const lines = useConsoleLines(bridge, playground);
  const items = useMemo(() => {
    const notice = t as unknown as NoticeText;
    const toItem = ({ seq, entry }: ConsoleLine): LogViewLine => {
      const time = fmt.time(entry.at);
      switch (entry.kind) {
        case "system":
          return {
            id: seq,
            time,
            tone: "notice",
            text: notice(`notice.${entry.notice.code}`, entry.notice.params),
          };
        case "command":
          return { id: seq, time, tone: "command", text: `$ ${entry.text}` };
        case "stderr":
          return { id: seq, time, tone: "error", text: entry.text };
        case "stdout":
          return { id: seq, time, text: entry.text };
      }
    };
    return lines.map(toItem);
  }, [lines, t, fmt]);
  return (
    <LogView
      {...(className === undefined ? {} : { className })}
      lines={items}
      label={t("desktop.output.aria")}
      empty={t("desktop.output.empty.label")}
    />
  );
}
