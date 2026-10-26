import type { TabRow } from "../src/shared/library-state.ts";
import { library, NOW, workspace } from "./scene-data.ts";
import type { SceneId } from "./scenes.ts";

const workspaces: readonly SceneId[] = [
  "Creating",
  "Missing",
  "Web",
  "Service",
  "WorkspaceMenu",
  "AttachedRun",
  "Script",
  "ScriptRunning",
  "ScriptStale",
  "ScriptFailed",
  "Stopped",
  "Crashed",
  "StartFailed",
  "WorkspaceRename",
  "CloseConfirm",
];
export function sceneState(scene: SceneId) {
  const state = library();
  const first = state.playgrounds[0];
  if (!first) throw new Error("画面契约缺少基础项目");
  if (scene === "Empty") state.playgrounds = [];
  if (scene === "FolderMissing")
    state.playgrounds[0] = {
      ...first,
      missing: true,
      folder: "~/Runyard/landing-hero",
    };
  if (scene === "CloseConfirm") state.closeRequest = { id: "landing-hero", name: "landing-hero" };
  if (scene === "UrlConfirm")
    state.linkConfirm = {
      template: { id: "html", name: { en: "HTML page", "zh-CN": "HTML 页面" } },
      name: "link-demo",
      folder: "~/Runyard/link-demo",
      source: "Example",
      fromProject: null,
    };
  if (["RunningPopover", "Main", "MainNarrow"].includes(scene)) {
    state.playgrounds[0] = { ...first, state: "ready", active: true, port: 7100 };
    state.tabs = [workspace()];
    state.runs = [
      {
        runId: "run-one",
        id: "landing-hero",
        name: "landing-hero",
        templateName: null,
        port: 7100,
        startedAt: NOW - 3600000,
        source: { kind: "tab" },
      },
    ];
  }
  if (["AgentActivity", "Notify", "NotifyCenter"].includes(scene)) {
    state.playgrounds[0] = {
      ...first,
      createdBy: { kind: "agent", agent: "Claude Code" },
      createdAt: NOW - 30000,
      lastUsedAt: NOW - 30000,
      lastOpenedAt: null,
      state: "ready",
      active: true,
      port: 7100,
    };
    state.runs = [
      {
        runId: "agent-run-one",
        id: first.id,
        name: first.name,
        templateName: null,
        port: 7100,
        startedAt: NOW - 30000,
        source: { kind: "cli", agent: "Claude Code" },
      },
    ];
    state.notices = [
      {
        id: "agent-one",
        kind: "agent-run",
        playgroundId: "landing-hero",
        name: "landing-hero",
        agent: "Claude Code",
        url: "http://127.0.0.1:7100/",
        at: NOW - 30000,
      },
    ];
  }
  if (["CleanReminder", "Notify", "NotifyCenter"].includes(scene)) {
    const idle = state.playgrounds[1];
    if (!idle) throw new Error("清理画面契约缺少闲置项目");
    state.playgrounds[1] = {
      ...idle,
      autoClean: { enabled: true, days: 30 },
      createdAt: NOW - 30 * 86400000,
      lastUsedAt: NOW - 29 * 86400000,
      lastOpenedAt: NOW - 29 * 86400000,
    };
    state.cleanReminder = [{ id: idle.id, name: idle.name, idleDays: 29 }];
  }
  if (["Update", "Notify", "NotifyCenter"].includes(scene))
    state.update = { latest: "0.3.0", current: "0.2.0" };
  if (!workspaces.includes(scene)) return state;
  const tab: TabRow = workspace();
  const patch = (value: Partial<TabRow>) => Object.assign(tab, value);
  if (scene === "Creating") patch({ state: "starting", status: "starting", previewUrl: null });
  if (scene === "Stopped")
    patch({ state: "stopped", status: "stopped", active: false, previewUrl: null });
  if (scene === "Crashed")
    patch({ state: "crashed", status: "crashed", active: false, previewUrl: null, exitCode: 1 });
  if (scene === "AttachedRun")
    patch({ ownedByTab: false, attached: { agent: "Claude Code", startedAt: NOW - 3600000 } });
  if (scene === "Service") patch({ service: true, previewUrl: null });
  if (scene.startsWith("Script"))
    patch({
      kind: "oneshot",
      port: null,
      previewUrl: null,
      state: "finished",
      status: "stopped",
      active: false,
      exitCode: 0,
      durationMs: 153,
    });
  if (scene === "ScriptRunning")
    patch({
      state: "running",
      status: "running",
      active: true,
      exitCode: null,
      startedAt: NOW - 15000,
    });
  if (scene === "ScriptStale") tab.stale = true;
  if (scene === "ScriptFailed")
    patch({
      state: "failed",
      status: "crashed",
      exitCode: 1,
      failure: {
        code: "RUN_FAILED",
        params: { name: "landing-hero", command: "node", detail: "fixture failure" },
      },
    });
  if (scene === "Missing" || scene === "StartFailed")
    patch({
      state: "failed",
      status: "crashed",
      active: false,
      previewUrl: null,
      failure:
        scene === "Missing"
          ? {
              code: "TOOL_MISSING",
              params: {
                tool: "go",
                required: ">=1.26 <2",
                installCommand: "brew install go",
                installUrl: "https://go.dev/dl/",
              },
            }
          : {
              code: "SETUP_FAILED",
              params: { name: "landing-hero", command: "pnpm install", exitCode: 1 },
            },
    });
  state.tabs = [tab];
  state.activeTab = tab.id;
  state.playgrounds[0] = {
    ...first,
    kind: tab.kind,
    state: tab.state,
    active: tab.active,
    port: tab.port,
    previewing: tab.previewUrl !== null,
  };
  state.runs = tab.active
    ? [
        {
          runId: "run-one",
          id: tab.id,
          name: tab.name,
          templateName: tab.templateName,
          port: tab.port,
          startedAt: tab.startedAt ?? NOW,
          source: tab.ownedByTab
            ? { kind: "tab" }
            : { kind: "cli", agent: tab.attached?.agent ?? null },
        },
      ]
    : [];
  return state;
}
