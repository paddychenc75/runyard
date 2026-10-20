import { join } from "node:path";
import type { LibraryState, PlaygroundRow, TabRow } from "../src/shared/library-state.ts";

// 与 Main / MainNarrow 同样的九行。这里只准备画面数据，运行生命周期由 library.e2e.ts 验证。
// 沿真实 IPC 事件送入真实应用，避免为拍图下载依赖，也不改用户的项目或产品代码。
const minute = 60_000;
const day = 24 * 60 * minute;

function rowFactory(base: LibraryState, root: string, now: number) {
  return (
    name: string,
    templateId: string,
    note: string,
    ago: number,
    extra: Partial<PlaygroundRow> = {},
  ): PlaygroundRow => ({
    id: name,
    name,
    path: join(root, "Runyard", name),
    folder: `~/Runyard/${name}`,
    kind: "server",
    state: "idle",
    active: false,
    previewing: false,
    busy: false,
    note,
    templateId,
    templateName: base.templates.find((template) => template.id === templateId)?.name ?? null,
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: now - ago,
    lastOpenedAt: now - ago,
    createdAt: now - 30 * day,
    createdBy: { kind: "user" },
    missing: false,
    ...extra,
  });
}

const agent = (name: string) => ({
  kind: "agent" as const,
  agent: "Claude Code",
  command: `runyard new ${name.replace(/-\d+$/, "")} ${name}`,
});

function runningRows(
  row: ReturnType<typeof rowFactory>,
  text: (zh: string, en: string) => string,
): PlaygroundRow[] {
  return [
    row(
      "landing-hero",
      "html",
      text("首页大图区域的排版练习", "Hero section layout practice"),
      2 * minute,
      {
        state: "ready",
        active: true,
        port: 7100,
      },
    ),
    row(
      "hono-1",
      "hono",
      text("回显 webhook 请求，核对签名头", "Echo webhook requests, check signature headers"),
      31 * minute,
      {
        state: "ready",
        active: true,
        port: 7103,
        createdBy: agent("hono-1"),
        autoClean: { enabled: true, days: 30 },
      },
    ),
  ];
}

function designRows(base: LibraryState, root: string, now: number): PlaygroundRow[] {
  const row = rowFactory(base, root, now);
  const text = (zh: string, en: string) => (base.locale === "en" ? en : zh);
  return [
    ...runningRows(row, text),
    row(
      "api-notes",
      "html",
      text("记录第三方接口的返回值", "Record what the third-party API returns"),
      0,
      {
        port: 7105,
        createdBy: { kind: "cli", command: "runyard new html api-notes" },
      },
    ),
    row("react19-1", "react19", "", 60 * minute, {
      port: 7102,
      createdBy: agent("react19-1"),
      autoClean: { enabled: true, days: 30 },
    }),
    row(
      "react18-1",
      "react18",
      text("旧版 Suspense 的行为对照", "Old Suspense behavior, compared"),
      3 * 60 * minute,
      {
        state: "crashed",
        port: 7104,
      },
    ),
    row(
      "go-channels",
      "go",
      text("带缓冲的 channel 与 worker 协作", "Buffered channels and workers"),
      day,
    ),
    row("vue-drag-list", "vue3", text("拖拽排序列表", "Drag-to-reorder list"), 2 * day, {
      missing: true,
      port: 7101,
    }),
    row(
      "node-ts-1",
      "node-ts",
      text("清洗 CSV，去掉重复行", "Clean a CSV, drop duplicate lines"),
      23 * day,
      {
        kind: "oneshot",
        createdBy: { ...agent("node-ts-1"), agent: "Codex" },
        autoClean: { enabled: true, days: 30 },
      },
    ),
    row(
      "python-1",
      "python",
      text("dataclass 和 pydantic 的校验差异", "Validation in dataclass vs pydantic"),
      29 * day + minute,
      {
        kind: "oneshot",
        createdBy: agent("python-1"),
        autoClean: { enabled: true, days: 30 },
      },
    ),
  ];
}

function designTab(row: PlaygroundRow): TabRow {
  return {
    id: row.id,
    name: row.name,
    status: "running",
    state: "ready",
    active: true,
    busy: false,
    kind: "server",
    ownedByTab: false,
    stale: false,
    scriptAutoRun: true,
    templateName: row.templateName,
    port: row.port,
    startedAt: row.lastUsedAt,
    exitCode: null,
    durationMs: null,
    previewUrl: null,
    slow: false,
    failure: null,
    portFallback: null,
    lastFrame: null,
    attached: { agent: row.createdBy.agent ?? null, startedAt: row.lastUsedAt },
    entry: null,
    folder: row.folder ?? row.path,
    phaseMs: { copy: null, install: null, start: null },
  };
}

export function libraryDesignFixture(base: LibraryState, root: string, now: number): LibraryState {
  const playgrounds = designRows(base, root, now);
  return {
    ...base,
    templateCount: 10,
    playgrounds,
    activeTab: "library",
    tabs: playgrounds.filter((row) => row.active).map(designTab),
    libraryRoot: "~/Runyard",
    loaded: true,
    cleanReminder: [],
    cleanDueCount: 1,
    notices: [],
    update: null,
    runs: playgrounds
      .filter((entry) => entry.active)
      .map((entry) => ({
        runId: `design-${entry.id}`,
        id: entry.id,
        name: entry.name,
        templateName: entry.templateName,
        port: entry.port,
        startedAt: entry.lastUsedAt,
        source: { kind: "cli" as const, agent: entry.createdBy.agent ?? null },
      })),
  };
}
