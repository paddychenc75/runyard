import type { Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import type { StatusMarkStatus } from "@runyard/ui";
import type { TabRow } from "../../shared/library-state.ts";
import { stateLabelKey } from "../library-view.ts";
import { runStatusOf, secondsOf } from "./run-view.ts";
import { useNow } from "./use-now.ts";

export interface RunStatusView {
  mark: StatusMarkStatus;
  danger: boolean;
  text: Localized;
}

/** 运行条和脚本输出头部共用的状态文字：“运行中 :7102”“已结束 · 退出码 0 · 0.18 秒” */
export function useRunStatus(tab: TabRow): RunStatusView {
  const t = useT();
  const fmt = useFormat();
  const now = useNow(1000);
  const { mark, danger, text } = runStatusOf(tab, now);
  const stateName = (state: Parameters<typeof stateLabelKey>[0]) => t(stateLabelKey(state));
  const seconds = (ms: number) =>
    t("desktop.duration.seconds.label", { seconds: fmt.number(secondsOf(ms)) });
  switch (text.kind) {
    case "plain":
      return { mark, danger, text: stateName(text.state) };
    case "port":
      return {
        mark,
        danger,
        text: t("desktop.runbar.state.label", {
          state: stateName(text.state),
          port: String(text.port),
        }),
      };
    case "script-running":
      return {
        mark,
        danger,
        text: t("desktop.script.running.label", {
          state: stateName(text.state),
          duration: seconds(text.elapsedMs),
        }),
      };
    case "script-ended":
      return {
        mark,
        danger,
        text:
          text.exitCode === null
            ? t("desktop.script.endedNoCode.label", {
                state: stateName(text.state),
                duration: seconds(text.durationMs),
              })
            : t("desktop.script.ended.label", {
                state: stateName(text.state),
                exitCode: fmt.number(text.exitCode),
                duration: seconds(text.durationMs),
              }),
      };
  }
}
