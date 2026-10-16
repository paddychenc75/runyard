import type { Locale } from "@runyard/i18n";
import type { LocalizedText, RunState } from "@runyard/protocol";
import type { StatusMarkStatus } from "@runyard/ui";
import type { PlaygroundRow } from "../shared/library-state.ts";

// 资源库列表里每一格“显示什么”的纯判断，不碰 DOM、不生成文字（文字在组件里经文案包），所以可以直接测。

const DAY_MS = 24 * 60 * 60 * 1000;

export function pickLocalizedText(text: LocalizedText, locale: Locale): string {
  return typeof text === "string" ? text : (text[locale] ?? text.en);
}

/** 行的状态标记的样子；没运行过算已停止（设计稿只有“已停止”，没有“未运行”） */
export function statusMarkOf(state: RunState | "idle"): StatusMarkStatus {
  switch (state) {
    case "ready":
    case "running":
      return "running";
    case "checking":
    case "installing":
    case "starting":
    case "reloading":
    case "stopping":
      return "starting";
    case "crashed":
    case "errored":
    case "failed":
      return "crashed";
    case "stopped":
    case "finished":
    case "idle":
      return "stopped";
  }
}

/** 状态文字用的文案键：从没运行过和已停止显示同一句；就绪的服务在列表里就是“运行中”（设计稿 Main） */
export function stateLabelKey(state: RunState | "idle"): `runState.${RunState}` {
  if (state === "idle") return "runState.stopped";
  return state === "ready" ? "runState.running" : `runState.${state}`;
}

export type Retention =
  | { kind: "kept" }
  | { kind: "autoClean"; daysLeft: number }
  | { kind: "autoCleanUnknown" };

/** 保留列：已保留，或自动清理还剩几天（从最近一次使用起算，不足一天按一天算，最少 0） */
export function retentionOf(row: PlaygroundRow, now: number): Retention {
  if (!row.autoClean.enabled) return { kind: "kept" };
  if (row.autoClean.days === null) return { kind: "autoCleanUnknown" };
  const elapsedDays = Math.floor(Math.max(0, now - row.lastUsedAt) / DAY_MS);
  return { kind: "autoClean", daysLeft: Math.max(0, row.autoClean.days - elapsedDays) };
}

/** 模板的缩写方块：id 带连字符取各段首字母（node-ts 是 NT），否则首字母大写加第二个字母小写（react19 是 Re） */
export function monogramOf(templateId: string): string {
  const segments = templateId.split("-").filter((segment) => /^[a-z]/i.test(segment));
  if (segments.length > 1) {
    return segments
      .slice(0, 2)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join("");
  }
  const letters = (segments[0] ?? templateId).replace(/[^a-z]/gi, "");
  return letters.charAt(0).toUpperCase() + letters.slice(1, 2).toLowerCase();
}

export type CreatorView = { kind: "me" } | { kind: "cli" } | { kind: "agent"; name: string | null };

export function creatorOf(row: PlaygroundRow): CreatorView {
  const { kind, agent } = row.createdBy;
  if (kind === "user") return { kind: "me" };
  if (kind === "agent") return { kind: "agent", name: agent ?? null };
  // 命令行创建的也可能带了智能体名字（PRD #prd-agent-created）：有名字就按智能体显示
  return agent === undefined ? { kind: "cli" } : { kind: "agent", name: agent };
}

export function runningCount(rows: readonly PlaygroundRow[]): number {
  return rows.filter((row) => row.active).length;
}
