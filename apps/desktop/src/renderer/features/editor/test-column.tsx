import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, type RenderResult, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type {
  BootstrapInfo,
  DesktopBridge,
  DesktopEvents,
} from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { useWorkspaceFiles } from "../../shared/workspace-files.tsx";
import { EditorColumn } from "./EditorColumn.tsx";
import { EditorWorkspace } from "./EditorWorkspace.tsx";
import type { EditorHost, EditorHostFactory } from "./monaco-host.ts";
import type { AutosaveMode } from "./session-types.ts";
import { type FakeDisk, fakeDisk, filesOn } from "./test-files.ts";

// 编辑器列的组件测试底座（只在 *.test.tsx 里导入）：假的桥、假的编辑器、内存里的磁盘

export const bootstrap: BootstrapInfo = {
  platform: "darwin",
  windowControls: { side: "left", inset: 72 },
  modKey: "meta",
  locale: "zh-CN",
  theme: "light",
  reducedTransparency: false,
  highContrast: false,
};

function projectTab(entry: string | null): TabRow {
  return {
    id: "demo",
    name: "demo",
    status: "running",
    state: "ready",
    active: true,
    busy: false,
    kind: "server",
    ownedByTab: true,
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
    entry,
    folder: "~/Runyard/demo",
    phaseMs: { copy: null, install: null, start: null },
  };
}

interface Harness {
  disk: FakeDisk;
  /** 主进程推来一个事件 */
  emit: <E extends keyof DesktopEvents>(event: E, payload: DesktopEvents[E]) => void;
  calls: [string, unknown][];
  hosts: {
    host: EditorHost;
    syncs: { theme: string; active: string | null }[];
    edit: (path: string, text: string) => void;
  }[];
}

export function mount(
  files: Parameters<typeof fakeDisk>[0],
  entry: string | null = "src/App.tsx",
  /** default = 外壳不传、用默认档（停止输入 1 秒后） */
  autosave: AutosaveMode | "default" = "off",
  /** 与编辑器列并排放的东西（测试里的探针） */
  extra: ReactNode = null,
): Harness & { view: RenderResult; openFile: (path: string) => void } {
  const disk = fakeDisk(files);
  const real = filesOn(disk);
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const harness: Harness = {
    disk,
    calls: [],
    hosts: [],
    emit: (event, payload) => {
      act(() => {
        for (const listener of listeners.get(event) ?? []) listener(payload);
      });
    },
  };
  const bridge = {
    bootstrap,
    call: async (
      method: string,
      param: { path: string; content?: string; eol?: "lf" | "crlf" },
    ) => {
      harness.calls.push([method, param]);
      if (method === "files.read") return real.read(param.path);
      if (method === "files.write") return real.write(param.path, param.content ?? "", param.eol);
      return undefined;
    },
    on: (event: string, listener: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    },
  } as unknown as DesktopBridge;
  const createHost: EditorHostFactory = async (_container, handlers) => {
    const syncs: { theme: string; active: string | null }[] = [];
    const host: EditorHost = {
      sync: (state, theme) => syncs.push({ theme, active: state.active }),
      focus() {},
      dispose() {},
    };
    harness.hosts.push({ host, syncs, edit: handlers.onEdit });
    return host;
  };
  const tab = projectTab(entry);
  let opener: (path: string) => void = () => {};
  function Tree() {
    opener = useWorkspaceFiles().openFile;
    return null;
  }
  const view = render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <EditorWorkspace
        bridge={bridge}
        tabs={[tab]}
        activeTab="demo"
        autosave={autosave === "default" ? undefined : () => autosave}
      >
        <Tree />
        {extra}
        <EditorColumn bridge={bridge} tab={tab} createHost={createHost} />
      </EditorWorkspace>
    </I18nProvider>,
  );
  return { ...harness, view, openFile: (path: string) => act(() => opener(path)) };
}

export const tabNames = () => screen.getAllByRole("tab").map((node) => node.textContent);
