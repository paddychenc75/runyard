import type { Playground, RunSnapshot, TemplateRecord } from "@runyard/protocol";

// 桌面应用测试用的样例数据（只被 *.test.ts 导入，不进构建产物）

export function playground(id: string, name = id): Playground {
  return {
    id,
    name,
    path: `/lib/${name}`,
    kind: "server",
    template: { id: "html", source: "builtin", appVersion: "0.0.0" },
    runner: "static",
    createdAt: 1,
    createdBy: { kind: "user" },
    autoClean: { enabled: false },
    lastUsedAt: 1,
  };
}

export function run(
  playgroundId: string,
  state: RunSnapshot["state"],
  extra: Partial<RunSnapshot> = {},
): RunSnapshot {
  return {
    runId: `run-${playgroundId}-${extra.startedAt ?? 1}`,
    playgroundId,
    name: playgroundId,
    kind: "server",
    state,
    owner: { kind: "tab", clientId: "c1", tabId: `tab-${playgroundId}` },
    startedAt: 1,
    cursor: "none:0",
    ...extra,
  };
}

export function template(id: string, extra: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    id,
    name: { en: id, "zh-CN": `${id}-zh` },
    description: id,
    category: "frontend",
    tags: [],
    source: "builtin",
    runner: "static",
    kind: "server",
    requires: {},
    valid: true,
    ...extra,
  };
}
