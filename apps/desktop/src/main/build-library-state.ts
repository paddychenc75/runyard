import type { Locale } from "@runyard/i18n";
import type {
  ErrorCode,
  Playground,
  RunSnapshot,
  RunState,
  TemplateRecord,
} from "@runyard/protocol";
import type {
  DesktopError,
  LibraryState,
  PlaygroundRow,
  TabRow,
  TabStatus,
} from "../shared/library-state.ts";

// 结束了的状态；其余都算进行中（run-state-machine.md 第 1 节）
const ENDED_STATES: readonly RunState[] = ["stopped", "finished", "errored", "crashed", "failed"];

/** 预览区有专门画面的启动失败；其余失败（脚本出错、超时等）不在这里 */
export const FAILURE_CODES: readonly ErrorCode[] = [
  "TOOL_MISSING",
  "TOOL_TOO_OLD",
  "RUNTIME_MISSING",
  "SETUP_FAILED",
  "DEPS_OFFLINE",
  "RUN_FAILED",
];

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
  /** 等确认关闭的标签（项目 id） */
  closeRequestId?: string | null;
  error: DesktopError | null;
  /** 启动请求失败时管理进程给的错误（项目 id → 错误）；带着缺工具的参数 */
  startErrors?: ReadonlyMap<string, DesktopError>;
  /** 崩溃前截下的预览最后一帧（项目 id → data 地址） */
  lastFrames?: ReadonlyMap<string, string>;
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

// 运行中的排最前，其余按上次打开从新到旧；从没打开过的用创建时间排，名字兜底（规格 DESKTOP-LIBRARY-VIEW-01）
function compareRows(a: PlaygroundRow, b: PlaygroundRow): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  const aTime = a.lastOpenedAt ?? a.createdAt;
  const bTime = b.lastOpenedAt ?? b.createdAt;
  if (aTime !== bTime) return bTime - aTime;
  return a.name.localeCompare(b.name);
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
  const templateNames = new Map(inputs.templates.map((template) => [template.id, template.name]));
  const rows = inputs.playgrounds.map((playground): PlaygroundRow => {
    const run = latest.get(playground.id);
    const active = run !== undefined && isActiveRun(run.state);
    return {
      id: playground.id,
      name: playground.name,
      path: playground.path,
      kind: playground.kind,
      state: run?.state ?? "idle",
      active,
      previewing: inputs.activeTab === playground.id,
      busy: inputs.busyIds.has(playground.id),
      note: playground.note ?? "",
      templateId: playground.template.id,
      templateName: templateNames.get(playground.template.id) ?? null,
      port: (active ? run.port : undefined) ?? playground.port ?? null,
      autoClean: {
        enabled: playground.autoClean.enabled,
        days: playground.autoClean.days ?? null,
      },
      lastUsedAt: playground.lastUsedAt,
      lastOpenedAt: playground.lastOpenedAt ?? null,
      createdBy: playground.createdBy,
      createdAt: playground.createdAt,
    };
  });
  const playgrounds = [...rows].sort(compareRows);
  const tabs: TabRow[] = [];
  for (const row of rows) {
    if (!inputs.tabIds.includes(row.id)) continue;
    const run = latest.get(row.id);
    tabs.push({
      id: row.id,
      name: row.name,
      status: tabStatus(row.state),
      state: row.state,
      active: row.active,
      busy: row.busy,
      kind: row.kind,
      ownedByTab: run?.owner.kind === "tab",
      templateName: row.templateName,
      port: row.port,
      startedAt: run?.startedAt ?? null,
      exitCode: run?.exitCode ?? null,
      durationMs: run?.durationMs ?? null,
      previewUrl: previewUrlFor(row.id, inputs.runs),
      slow: run?.state === "starting" && run.slow === true,
      failure: failureOf(row, run, inputs.startErrors?.get(row.id)),
      portFallback: portFallbackOf(row.active ? run : undefined),
      lastFrame: run?.state === "crashed" ? (inputs.lastFrames?.get(row.id) ?? null) : null,
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
    closeRequest: closeRequestOf(inputs.closeRequestId ?? null, rows),
    error: inputs.error,
  };
}

function closeRequestOf(
  id: string | null,
  rows: readonly PlaygroundRow[],
): LibraryState["closeRequest"] {
  if (id === null) return null;
  const row = rows.find((candidate) => candidate.id === id);
  return row === undefined ? null : { id, name: row.name };
}

/** 这个项目最近一次运行是否由标签页持有且仍在进行：关闭标签页要停它（命令行持有的和已停止的不用） */
export function ownedActiveRun(
  playgroundId: string,
  runs: readonly RunSnapshot[],
): RunSnapshot | null {
  const run = latestRunByPlayground(runs).get(playgroundId);
  return run !== undefined && run.owner.kind === "tab" && isActiveRun(run.state) ? run : null;
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

function failureOf(
  row: PlaygroundRow,
  run: RunSnapshot | undefined,
  recorded: DesktopError | undefined,
): DesktopError | null {
  if (run === undefined || row.kind === "oneshot") return null;
  if (run.state !== "failed" && run.state !== "errored") return null;
  const code = run.reason;
  if (code === undefined || !FAILURE_CODES.includes(code)) return null;
  if (recorded?.code === code) return recorded;
  // 缺工具的参数（要什么、当前什么版本）只有启动请求的错误响应里有；其余失败只需要项目名
  if (code === "TOOL_MISSING" || code === "TOOL_TOO_OLD" || code === "RUNTIME_MISSING") return null;
  return { code, params: { name: row.name } };
}

function portFallbackOf(run: RunSnapshot | undefined): TabRow["portFallback"] {
  const fallback = run?.portFallback;
  if (run === undefined || fallback === undefined || run.port === undefined) return null;
  return {
    wanted: fallback.wanted,
    actual: run.port,
    reason: fallback.reason,
    occupant: fallback.occupant ?? null,
  };
}
