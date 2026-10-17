import type { Locale } from "@runyard/i18n";
import type {
  ErrorCode,
  Playground,
  RunSnapshot,
  RunState,
  TemplateRecord,
} from "@runyard/protocol";
import { idleDaysOf, isDueTomorrow } from "../shared/clean-due.ts";
import type {
  AppNotice,
  DesktopError,
  LibraryState,
  PlaygroundRow,
  RunningRow,
  StartPhaseMs,
  TabRow,
  TabStatus,
  TemplateRow,
} from "../shared/library-state.ts";
import { displayPath } from "./library-root.ts";

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
  /** 等确认的标签页里，终端还在运行的命令；没有是 null */
  closeTerminal?: { command: string; stopsRun: boolean } | null;
  error: DesktopError | null;
  /** 资源库文件夹的显示写法（主目录缩成 ~）；还没读到是空串 */
  libraryRoot?: string;
  /** 启动请求失败时管理进程给的错误（项目 id → 错误）；带着缺工具的参数 */
  startErrors?: ReadonlyMap<string, DesktopError>;
  /** 崩溃前截下的预览最后一帧（项目 id → data 地址） */
  lastFrames?: ReadonlyMap<string, string>;
  /** 主目录，把项目文件夹显示成 ~/…；不给就原样显示 */
  home?: string;
  /** 第一次读完资源库了没有；不给按已读完算 */
  loaded?: boolean;
  /** 启动清单各步的用时（项目 id → 用时） */
  phases?: (playgroundId: string) => StartPhaseMs;
  /** 此刻（毫秒）：自动清理提醒按它算；不给用系统时钟 */
  now?: number;
  /** 点了“稍后再说”的项目：提示条不再列出它们，行标签和角标照旧 */
  cleanLater?: ReadonlySet<string>;
  libraryRootSynced?: boolean;
  notices?: readonly AppNotice[];
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
      missing: playground.missingSince !== undefined,
      folder:
        inputs.home === undefined ? playground.path : displayPath(playground.path, inputs.home),
    };
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const playgrounds = [...rows].sort(compareRows);
  const entries = new Map(
    inputs.playgrounds.map((playground) => [playground.id, playground.entry]),
  );
  const autoRuns = new Map(
    inputs.playgrounds.map((playground) => [playground.id, playground.scriptAutoRun]),
  );
  const serviceTemplates = new Set(
    inputs.templates.filter((template) => template.category === "service").map((t) => t.id),
  );
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
      stale: run?.stale === true,
      scriptAutoRun: autoRuns.get(row.id) ?? true,
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
      attached: attachedOf(run),
      entry: entries.get(row.id) ?? null,
      folder: row.folder ?? row.path,
      phaseMs: inputs.phases?.(row.id) ?? { copy: null, install: null, start: null },
      missing: row.missing,
      service: serviceTemplates.has(row.templateId),
    });
  }
  tabs.sort((a, b) => inputs.tabIds.indexOf(a.id) - inputs.tabIds.indexOf(b.id));
  // 无效的用户模板建不出项目，选择器里只给格式有效的；用户自己的模板归在“我的”（规格 DESKTOP-TEMPLATES-VIEW-09）
  const templates = inputs.templates
    .filter((template) => template.valid && template.kind !== null)
    .map(
      (template): TemplateRow => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.source === "user" ? "mine" : template.category,
        unmaintained: template.tags.includes("unmaintained"),
      }),
    );
  return {
    locale: inputs.locale,
    playgrounds,
    tabs,
    activeTab: inputs.activeTab,
    templates,
    templateCount: inputs.templates.length,
    runs: runningRows(inputs.runs, (id) => rowById.get(id)?.templateName ?? null),
    loaded: inputs.loaded ?? true,
    recentTemplates: recentTemplateIds(inputs.playgrounds, templates),
    closeRequest: closeRequestOf(inputs.closeRequestId ?? null, rows, inputs.closeTerminal ?? null),
    error: inputs.error,
    libraryRoot: inputs.libraryRoot ?? "",
    libraryRootSynced: inputs.libraryRootSynced ?? false,
    ...cleanReminderOf(rows, inputs.now ?? Date.now(), inputs.cleanLater),
    notices: [...(inputs.notices ?? [])],
  };
}

// 离到期不足一天的项目：数量给 Dock 角标，名单给提示条（点过“稍后再说”的不再列）；按到期先后排
function cleanReminderOf(
  rows: readonly PlaygroundRow[],
  now: number,
  later: ReadonlySet<string> = new Set(),
): Pick<LibraryState, "cleanReminder" | "cleanDueCount"> {
  const due = rows.filter((row) => isDueTomorrow(row, now));
  return {
    cleanDueCount: due.length,
    cleanReminder: due
      .filter((row) => !later.has(row.id))
      .map((row) => ({ id: row.id, name: row.name, idleDays: idleDaysOf(row, now) }))
      .sort((a, b) => b.idleDays - a.idleDays || a.name.localeCompare(b.name)),
  };
}

function attachedOf(run: RunSnapshot | undefined): TabRow["attached"] {
  if (run === undefined || run.owner.kind !== "cli" || !isActiveRun(run.state)) return null;
  return { agent: run.owner.agent ?? null, startedAt: run.startedAt };
}

/** 运行视图的列表：仍在进行的运行，标签页持有的在前，同类按开始先后；已结束的脚本不列出 */
export function runningRows(
  runs: readonly RunSnapshot[],
  templateOf: (playgroundId: string) => TemplateRecord["name"] | null,
): RunningRow[] {
  const rows = runs
    .filter((run) => isActiveRun(run.state))
    .map(
      (run): RunningRow => ({
        runId: run.runId,
        id: run.playgroundId,
        name: run.name,
        templateName: templateOf(run.playgroundId),
        port: run.port ?? null,
        startedAt: run.startedAt,
        source:
          run.owner.kind === "tab"
            ? { kind: "tab" }
            : { kind: "cli", agent: run.owner.agent ?? null },
      }),
    );
  const rank = (row: RunningRow) => (row.source.kind === "tab" ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || a.startedAt - b.startedAt);
}

function closeRequestOf(
  id: string | null,
  rows: readonly PlaygroundRow[],
  terminal: { command: string; stopsRun: boolean } | null,
): LibraryState["closeRequest"] {
  if (id === null) return null;
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) return null;
  return terminal === null
    ? { id, name: row.name }
    : { id, name: row.name, terminalCommand: terminal.command, stopsRun: terminal.stopsRun };
}

/** 这个项目最近一次运行是否由标签页持有且仍在进行：关闭标签页要停它（命令行持有的和已停止的不用） */
export function ownedActiveRun(
  playgroundId: string,
  runs: readonly RunSnapshot[],
): RunSnapshot | null {
  const run = latestRunByPlayground(runs).get(playgroundId);
  return run !== undefined && run.owner.kind === "tab" && isActiveRun(run.state) ? run : null;
}

/**
 * 标签页持有的脚本已经跑完（finished、errored）：它还在被监听、保存会重新运行（RUN-SCRIPTS-32），
 * 关标签页要发一次 run.stop 结束监听。停止的是空操作，运行本身不受影响
 */
export function ownedFinishedScript(
  playgroundId: string,
  runs: readonly RunSnapshot[],
): RunSnapshot | null {
  const run = latestRunByPlayground(runs).get(playgroundId);
  const finished = run?.state === "finished" || run?.state === "errored";
  return run !== undefined && run.owner.kind === "tab" && run.kind === "oneshot" && finished
    ? run
    : null;
}

/** 关标签页要不要发 run.stop：进行中的标签页运行，或还在被监听的已跑完的脚本 */
export function needsStopOnClose(playgroundId: string, runs: readonly RunSnapshot[]): boolean {
  return (
    ownedActiveRun(playgroundId, runs) !== null || ownedFinishedScript(playgroundId, runs) !== null
  );
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

/** 当前标签页的预览地址；服务类项目右侧是请求面板，没有网页可预览（规格 DESKTOP-REQUEST-PANEL-01） */
export function previewUrlForTab(
  tabs: readonly TabRow[],
  previewId: string,
  runs: readonly RunSnapshot[],
): string | null {
  return tabs.find((tab) => tab.id === previewId)?.service === true
    ? null
    : previewUrlFor(previewId, runs);
}

function failureOf(
  row: PlaygroundRow,
  run: RunSnapshot | undefined,
  recorded: DesktopError | undefined,
): DesktopError | null {
  if (run === undefined) return null;
  // 脚本只有“没能启动”（failed）才有失败原因；跑出错（errored）看输出里的报错（规格 DESKTOP-WORKSPACE-40、41）
  const oneshot = row.kind === "oneshot";
  if (run.state !== "failed" && (oneshot || run.state !== "errored")) return null;
  const code = run.reason;
  const known = code !== undefined && FAILURE_CODES.includes(code);
  if (known && recorded?.code === code) return recorded;
  // 缺工具的参数（要什么、当前什么版本）只有启动请求的错误响应里有；服务退回“已停止”加“运行”，
  // 脚本不能没有说明，退回“启动失败”这一条通用的原因
  const needsParams =
    code === "TOOL_MISSING" || code === "TOOL_TOO_OLD" || code === "RUNTIME_MISSING";
  if (!known || needsParams)
    return oneshot ? { code: "RUN_FAILED", params: { name: row.name } } : null;
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

/** 按项目的创建时间从新到旧，取用过的模板，同一个模板只算一次；不在模板列表里的（已删除的用户模板）略过 */
export function recentTemplateIds(
  playgrounds: readonly Playground[],
  templates: readonly TemplateRow[],
): string[] {
  const known = new Set(templates.map((template) => template.id));
  const recent: string[] = [];
  for (const playground of [...playgrounds].sort((a, b) => b.createdAt - a.createdAt)) {
    const id = playground.template.id;
    if (known.has(id) && !recent.includes(id)) recent.push(id);
  }
  return recent;
}
