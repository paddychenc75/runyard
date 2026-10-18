// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";

// 文件树和编辑器不在这里测（它们要 Monaco）：换成空壳，只看右侧放的是什么
// （共用的热身已经把真的 TabContent 载入过，所以先清掉模块缓存再登记替身、再导入被测的组件）
vi.resetModules();
vi.doMock("./TabContent.tsx", () => ({
  TabContent: ({ children }: { children: (editor: null) => React.ReactNode }) => children(null),
}));
const { desktopCatalogs } = await import("@runyard/i18n");
const { I18nProvider } = await import("@runyard/i18n/react");
const { cleanup, render } = await import("@testing-library/react");
const { defaultLayoutPrefs } = await import("../shared/layout-prefs.ts");
const { OverlayCounter } = await import("../shared/overlay-counter.ts");
const { sampleTab } = await import("./sample-tab.ts");
const { WorkspaceLayout } = await import("./WorkspaceLayout.tsx");

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderLayout(tab: TabRow) {
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: async (method: string) => (method === "console.get" ? [] : null),
    on: () => () => {},
  } as unknown as DesktopBridge;
  return render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <WorkspaceLayout
        bridge={bridge}
        tab={tab}
        overlays={new OverlayCounter()}
        prefs={defaultLayoutPrefs}
        onPrefs={() => {}}
      />
    </I18nProvider>,
  );
}

describe("工作区右侧", () => {
  it("[DESKTOP-REQUEST-PANEL-01] 服务项目右侧是请求面板，没有网页预览；网页项目是预览，脚本是输出", () => {
    const service = renderLayout(sampleTab({ service: true, port: 7102 }));
    expect(service.container.querySelector("[data-request-panel]")).not.toBeNull();
    expect(service.container.querySelector("[data-preview-pane]")).toBeNull();
    cleanup();
    const web = renderLayout(sampleTab());
    expect(web.container.querySelector("[data-preview-pane]")).not.toBeNull();
    expect(web.container.querySelector("[data-request-panel]")).toBeNull();
    cleanup();
    const script = renderLayout(sampleTab({ kind: "oneshot", port: null, service: true }));
    expect(script.container.querySelector("[data-script-output]")).not.toBeNull();
    expect(script.container.querySelector("[data-request-panel]")).toBeNull();
  });
});

describe("缺工具的画面（任何类型的项目都一样）", () => {
  const failure = (code: "TOOL_MISSING" | "TOOL_TOO_OLD") => ({
    code,
    params: {
      tool: "go",
      required: ">=1.26 <2",
      ...(code === "TOOL_TOO_OLD" ? { found: "1.20.1" } : {}),
      installCommand: "brew install go",
      installUrl: "https://go.dev/dl/",
    },
  });
  const failed = { state: "failed", active: false, status: "crashed", port: null } as const;

  it("[DESKTOP-WORKSPACE-18] 脚本项目过旧：右侧是缺工具画面，没有输出区和“启动失败”", () => {
    const view = renderLayout(
      sampleTab({ ...failed, kind: "oneshot", failure: failure("TOOL_TOO_OLD") }),
    );
    expect(view.container.querySelector("[data-failure-screen=missing]")).not.toBeNull();
    expect(view.container.querySelector("[data-script-output]")).toBeNull();
    expect(view.getByText("1.20.1")).toBeTruthy();
    expect(view.queryByText(/启动失败/)).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-18] 服务项目没装：右侧是缺工具画面，不是请求面板", () => {
    const view = renderLayout(
      sampleTab({ ...failed, service: true, failure: failure("TOOL_MISSING") }),
    );
    expect(view.container.querySelector("[data-failure-screen=missing]")).not.toBeNull();
    expect(view.container.querySelector("[data-request-panel]")).toBeNull();
    expect(view.getByText("brew install go")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-18] 网页项目没装：预览区是缺工具画面", () => {
    const view = renderLayout(sampleTab({ ...failed, failure: failure("TOOL_MISSING") }));
    expect(view.container.querySelector("[data-failure-screen=missing]")).not.toBeNull();
  });
});
