import type { LibraryState, PlaygroundRow } from "../src/shared/library-state.ts";

/** 固定契约数据，只用于画面工作台；不连接管理进程或创建真实项目。 */
export const NOW = Date.UTC(2026, 9, 19, 12);
export function project(id: string, patch: Partial<PlaygroundRow> = {}): PlaygroundRow {
  return {
    id,
    name: id,
    path: `/fixture/${id}`,
    kind: "server",
    state: "idle",
    active: false,
    previewing: false,
    busy: false,
    note: "",
    templateId: "html",
    templateName: { en: "HTML page", "zh-CN": "HTML 页面" },
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW - 3600000,
    lastOpenedAt: NOW - 3600000,
    createdBy: { kind: "user" },
    createdAt: NOW - 86400000,
    missing: false,
    ...patch,
  };
}
export function library(): LibraryState {
  return {
    locale: "en",
    playgrounds: [project("landing-hero"), project("api-notes", { createdBy: { kind: "cli" } })],
    tabs: [],
    activeTab: "library",
    templates: [
      {
        id: "html",
        name: { en: "HTML page", "zh-CN": "HTML 页面" },
        description: { en: "HTML, CSS and JavaScript", "zh-CN": "HTML、CSS 和 JavaScript" },
        category: "page",
        unmaintained: false,
      },
    ],
    recentTemplates: [],
    runs: [],
    loaded: true,
    closeRequest: null,
    error: null,
    libraryRoot: "~/Runyard",
    updateReady: true,
  };
}

export function workspace() {
  return {
    id: "landing-hero",
    name: "landing-hero",
    status: "running" as const,
    state: "ready" as const,
    active: true,
    busy: false,
    kind: "server" as const,
    ownedByTab: true,
    attached: null,
    stale: false,
    scriptAutoRun: true,
    templateName: null,
    port: 7100,
    startedAt: NOW - 3600000,
    exitCode: null,
    durationMs: null,
    previewUrl: "http://127.0.0.1:7100/",
    slow: false,
    failure: null,
    portFallback: null,
    lastFrame: null,
    entry: null,
    folder: "~/Runyard/landing-hero",
    phaseMs: { copy: 15, install: 1200, start: 30 },
  };
}
