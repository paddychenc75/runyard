import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow, TemplateRow } from "../../../shared/library-state.ts";
import type {
  SaveTemplatePlan,
  SaveTemplateRequest,
  TemplateDetailView,
  TemplatePageRow,
} from "../../../shared/templates-view.ts";
import { AppFrame } from "../AppFrame.tsx";

// 模板页和另存弹窗的测试共用的假主进程：模板列表、详情、另存的计划都由测试给，
// template.save 成功后像真的一样把新模板加进资源库状态并推 library.changed。

export const name = (en: string, zh: string) => ({ en, "zh-CN": zh });

export function pageRow(
  id: string,
  category: TemplatePageRow["category"],
  extra: Partial<TemplatePageRow> = {},
): TemplatePageRow {
  const source = extra.source ?? "builtin";
  return {
    key: `${source}:${id}`,
    id,
    source,
    name: name(id, id),
    description: `${id} description`,
    category,
    valid: true,
    unmaintained: false,
    problem: null,
    ...extra,
  };
}

export function detailOf(row: TemplatePageRow, extra: Partial<TemplateDetailView> = {}) {
  return {
    row,
    tags: [],
    path: `/templates/${row.id}`,
    tools: [],
    run: null,
    files: ["package.json", "src/App.tsx"],
    ...extra,
  } satisfies TemplateDetailView;
}

export const project: PlaygroundRow = {
  id: "hono-todo-api",
  name: "hono-todo-api",
  path: "/lib/hono-todo-api",
  kind: "server",
  state: "idle",
  active: false,
  previewing: false,
  busy: false,
  note: "",
  templateId: "hono",
  templateName: name("Hono", "Hono"),
  port: null,
  autoClean: { enabled: false, days: null },
  lastUsedAt: 1,
  lastOpenedAt: 1,
  createdBy: { kind: "user" },
  createdAt: 1,
  missing: false,
};

export const plan: SaveTemplatePlan = {
  projectName: "hono-todo-api",
  files: ["package.json", "src/index.ts", "tsconfig.json"],
  excluded: [
    { path: "node_modules", directory: true, reason: "dependencies" },
    { path: ".env", directory: false, reason: "secret" },
    { path: "dist", directory: true, reason: "build" },
  ],
  templateName: name("Hono", "Hono"),
  requires: [
    { tool: "node", version: ">=20.19 <27" },
    { tool: "pnpm", version: ">=9" },
  ],
  takenIds: ["hono", "todo-api"],
  userDir: "~/.runyard/templates",
};

export function libraryOf(
  templates: TemplateRow[],
  playgrounds: PlaygroundRow[] = [],
  extra: Partial<LibraryState> = {},
): LibraryState {
  return {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates,
    runs: [],
    loaded: true,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds,
    ...extra,
  };
}

export interface WorldOptions {
  library: LibraryState;
  rows?: TemplatePageRow[];
  details?: Record<string, TemplateDetailView>;
  plan?: SaveTemplatePlan;
  saved?: { request: SaveTemplateRequest }[];
}

export function setupWorld(options: WorldOptions, locale: "zh-CN" | "en" = "zh-CN") {
  let state = options.library;
  const listeners = new Map<string, (payload: never) => void>();
  const calls: { method: string; param: unknown }[] = [];
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push({ method, param });
    switch (method) {
      case "library.get":
        return state;
      case "template.list":
        return options.rows ?? [];
      case "template.detail": {
        const { id, source } = param as { id: string; source: string };
        return options.details?.[`${source}:${id}`] ?? null;
      }
      case "template.savePlan":
        return options.plan === undefined
          ? { ok: false, error: { code: "INTERNAL", params: {} } }
          : { ok: true, plan: options.plan };
      case "template.save": {
        const request = param as SaveTemplateRequest;
        options.saved?.push({ request });
        state = {
          ...state,
          templates: [
            ...state.templates,
            {
              id: request.id,
              name: request.name,
              description: request.description,
              category: "mine",
              unmaintained: false,
            },
          ],
        };
        listeners.get("library.changed")?.(state as never);
        return { ok: true, id: request.id };
      }
      default:
        return { ok: true };
    }
  });
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale,
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const bridge = {
    bootstrap,
    call,
    on: (event: string, listener: (payload: never) => void) => {
      listeners.set(event, listener);
      return () => {};
    },
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale={locale} theme="light" />);
  return { call, calls, emit: (event: string) => listeners.get(event)?.(undefined as never) };
}
