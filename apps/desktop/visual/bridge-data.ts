import type { Settings, ToolCheck } from "@runyard/protocol";
import type { DesktopMethod, DesktopMethods } from "../src/shared/desktop-bridge.ts";
import type { LibraryState } from "../src/shared/library-state.ts";
import type { TemplatePageRow } from "../src/shared/templates-view.ts";
import { NOW } from "./scene-data.ts";

export const settings: Settings = {
  libraryRoot: "/fixture/Runyard",
  packageManager: "auto",
  scriptAutoRun: true,
  cliIdleStopMinutes: 30,
  toolPaths: {},
  ports: { min: 7100, max: 7999 },
  urlNewSkipConfirmForBuiltin: false,
  updateCheck: true,
  autoSave: "delay",
  theme: "system",
  network: { noProxyLocal: true },
  confirmCloseRunningTab: true,
};
export function bridgeAnswers(
  state: LibraryState,
): Partial<{ [Key in DesktopMethod]: DesktopMethods[Key]["result"] }> {
  const template = state.templates[0];
  if (!template) throw new Error("画面契约缺少模板");
  const row: TemplatePageRow = {
    ...template,
    key: "builtin:html",
    source: "builtin",
    valid: true,
    problem: null,
  };
  const tools: ToolCheck[] = [
    { tool: "go", status: "found", version: "1.26.2", path: "/fixture/bin/go", arch: "arm64" },
    { tool: "node", status: "found", version: "24.21.0", path: "/fixture/bin/node", arch: "arm64" },
    { tool: "pnpm", status: "found", version: "11.28.0", path: "/fixture/bin/pnpm" },
    {
      tool: "python",
      status: "too-old",
      version: "3.9.6",
      path: "/fixture/bin/python3",
      arch: "universal",
      required: ">=3.12",
    },
  ];
  return {
    "library.get": state,
    "console.get": [{ seq: 1, entry: { at: NOW, kind: "stdout", text: "Fixture output: ready" } }],
    "files.list": { ok: true, value: [] },
    "files.listAll": { ok: true, value: [] },
    "request.getLast": null,
    "request.send": {
      outcome: "response",
      status: 200,
      statusText: "OK",
      durationMs: 12,
      size: '{"message":"Contract response"}'.length,
      headers: [{ name: "content-type", value: "application/json" }],
      payload: '{"message":"Contract response"}',
    },
    "template.list": [row],
    "template.detail": {
      row,
      tags: [],
      path: "/fixture/templates/html",
      tools: [],
      run: { install: null, start: null, ready: null },
      files: ["index.html", "style.css"],
    },
    "template.savePlan": {
      ok: true,
      plan: {
        projectName: "landing-hero",
        files: ["index.html", "style.css"],
        excluded: [{ path: "node_modules", directory: true, reason: "dependencies" }],
        templateName: row.name,
        requires: [],
        takenIds: ["html"],
        userDir: "~/.runyard/templates",
      },
    },
    "settings.get": settings,
    "settings.localNetwork": {},
    "settings.editors": [{ id: "vscode", name: "VS Code" }],
    "toolchain.check": { tools },
    "toolchain.recheck": { tools },
    "cli.status": { state: "unavailable", version: "0.1.0", onPath: false, pathCommand: "" },
    "agents.status": { claude: false, agents: false },
    "supervisor.status": { running: false, cliRuns: 0, tabRuns: 0 },
    "terminal.status": { open: false, command: null },
  };
}
