import type { Playground } from "./playground.ts";
import type { RunSnapshot } from "./run-snapshot.ts";
import type { Settings } from "./settings.ts";
import type { TemplateRecord } from "./template-record.ts";

// 测试用的样例数据：一份合法的项目记录、运行快照和设置。只被 *.test.ts 导入。

export const samplePlayground: Playground = {
  id: "01JABCDEF0123456789ABCDEFG",
  name: "pricing-table",
  path: "/Users/someone/Runyard/pricing-table",
  kind: "server",
  template: { id: "react19", source: "builtin", appVersion: "1.0.0" },
  runner: "vite",
  packageManager: "pnpm",
  entry: "src/App.tsx",
  note: "pricing table layout test",
  createdAt: 1_760_000_000_000,
  createdBy: { kind: "agent", agent: "Claude Code", command: "new react19 pricing-table" },
  autoClean: { enabled: false },
  port: 7100,
  lastUsedAt: 1_760_000_100_000,
};

export const sampleRun: RunSnapshot = {
  runId: "r_1",
  playgroundId: samplePlayground.id,
  name: "pricing-table",
  kind: "server",
  state: "ready",
  owner: { kind: "cli", agent: "Claude Code", command: "run pricing-table" },
  port: 7100,
  url: "http://127.0.0.1:7100",
  pid: 4242,
  startedAt: 1_760_000_200_000,
  readyMs: 1800,
  idleStopAt: 1_760_001_800_000,
  cursor: "r_1:12",
};

export const sampleSettings: Settings = {
  libraryRoot: "/Users/someone/Runyard",
  packageManager: "auto",
  scriptAutoRun: true,
  cliIdleStopMinutes: 30,
  toolPaths: { node: "/opt/node24/bin/node" },
  ports: { min: 7100, max: 7999 },
  urlNewSkipConfirmForBuiltin: false,
  updateCheck: true,
  confirmCloseRunningTab: true,
};

export const sampleTemplateRecord: TemplateRecord = {
  id: "react19",
  name: { en: "React 19", "zh-CN": "React 19" },
  description: { en: "React 19 with Vite", "zh-CN": "React 19 with Vite" },
  category: "frontend",
  tags: [],
  source: "builtin",
  runner: "vite",
  kind: "server",
  requires: {
    node: { version: ">=22.18 <27" },
    pnpm: { version: ">=10.34.6 <12", fallback: "npm" },
  },
  valid: true,
};
