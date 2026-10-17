import type { TabRow } from "../../shared/library-state.ts";

/** 测试用的项目标签：默认是一个运行中的服务，要改什么传什么（只在 *.test.tsx 里导入） */
export function sampleTab(extra: Partial<TabRow> = {}): TabRow {
  return {
    id: "a",
    name: "react-counter",
    status: "running",
    state: "ready",
    active: true,
    busy: false,
    kind: "server",
    ownedByTab: true,
    attached: null,
    stale: false,
    scriptAutoRun: true,
    templateName: null,
    port: 7101,
    startedAt: 1_000,
    exitCode: null,
    durationMs: null,
    previewUrl: null,
    slow: false,
    failure: null,
    portFallback: null,
    lastFrame: null,
    entry: null,
    folder: "~/Runyard/react-counter",
    phaseMs: { copy: null, install: null, start: null },
    ...extra,
  };
}
