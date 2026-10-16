import type { Locale } from "@runyard/i18n";
import type { Playground, RunSnapshot, RunState, TemplateRecord } from "@runyard/protocol";
import type {
  DesktopError,
  LibraryState,
  PlaygroundRow,
  TabRow,
  TabStatus,
} from "../shared/library-state.ts";

// 结束了的状态；其余都算进行中（run-state-machine.md 第 1 节）
const ENDED_STATES: readonly RunState[] = ["stopped", "finished", "errored", "crashed", "failed"];

export function isActiveRun(state: RunState): boolean {
  return !ENDED_STATES.includes(state);
}

export interface LibraryInputs {
  locale: Locale;
  playgrounds: readonly Playground[];
  runs: readonly RunSnapshot[];
  templates: readonly TemplateRecord[];
  /** 打开的项目标签（项目 id，按打开顺序） */
  tabIds: readonly string[];
  activeTab: string;
  busyIds: ReadonlySet<string>;
  error: DesktopError | null;
}

/** 每个项目取最近一次运行（startedAt 最大）；它决定列表里显示的状态 */
export function latestRunByPlayground(runs: readonly RunSnapshot[]): Map<string, RunSnapshot> {
  const latest = new Map<string, RunSnapshot>();
  for (const run of runs) {
    const current = latest.get(run.playgroundId);
    if (current === undefined || run.startedAt > current.startedAt)
      latest.set(run.playgroundId, run);
  }
  return latest;
}

/** 运行状态归并成标签上的小圆点：就绪和运行中是绿，准备中是黄，崩溃失败是红，其余（含手动停止）是空心 */
export function tabStatus(state: RunState | "idle"): TabStatus {
  switch (state) {
    case "ready":
    case "running":
    case "reloading":
      return "running";
    case "checking":
    case "installing":
    case "starting":
      return "starting";
    case "crashed":
    case "errored":
    case "failed":
      return "crashed";
    default:
      return "stopped";
  }
}

export function buildLibraryState(inputs: LibraryInputs): LibraryState {
  const latest = latestRunByPlayground(inputs.runs);
  const playgrounds = inputs.playgrounds.map((playground): PlaygroundRow => {
    const run = latest.get(playground.id);
    return {
      id: playground.id,
      name: playground.name,
      kind: playground.kind,
      state: run?.state ?? "idle",
      active: run !== undefined && isActiveRun(run.state),
      previewing: inputs.activeTab === playground.id,
      busy: inputs.busyIds.has(playground.id),
    };
  });
  const tabs: TabRow[] = [];
  for (const row of playgrounds) {
    if (!inputs.tabIds.includes(row.id)) continue;
    tabs.push({
      id: row.id,
      name: row.name,
      status: tabStatus(row.state),
      state: row.state,
      active: row.active,
      busy: row.busy,
      previewUrl: previewUrlFor(row.id, inputs.runs),
    });
  }
  tabs.sort((a, b) => inputs.tabIds.indexOf(a.id) - inputs.tabIds.indexOf(b.id));
  return {
    locale: inputs.locale,
    playgrounds,
    tabs,
    activeTab: inputs.activeTab,
    // 无效的用户模板建不出项目，列表里只给内置的、格式有效的
    templates: inputs.templates
      .filter(
        (template) => template.source === "builtin" && template.valid && template.kind !== null,
      )
      .map((template) => ({ id: template.id, name: template.name })),
    error: inputs.error,
  };
}

/** 预览该显示哪个地址：被选中的项目的最近一次运行已就绪且有地址 */
export function previewUrlFor(
  previewId: string | null,
  runs: readonly RunSnapshot[],
): string | null {
  if (previewId === null) return null;
  const run = latestRunByPlayground(runs).get(previewId);
  if (run === undefined || run.state !== "ready" || run.url === undefined) return null;
  return run.url;
}
