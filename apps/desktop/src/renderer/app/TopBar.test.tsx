// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { sampleTab } from "./sample-tab.ts";
import { TopBar } from "./TopBar.tsx";

afterEach(cleanup);

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

function show(tab: TabRow) {
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: vi.fn(async () => undefined),
    on: () => () => {},
  } as unknown as DesktopBridge;
  render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <TopBar
        bridge={bridge}
        modKey="meta"
        tabs={[tab]}
        activeTab={tab.id}
        running={1}
        playgrounds={[]}
        runs={[]}
        activeTabRow={tab}
        onNew={() => {}}
        sidebarVisible
        onSelect={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  return screen.getByRole("tablist");
}

describe("标签条上的持有者徽标", () => {
  it("[DESKTOP-WORKSPACE-26] 命令行持有的运行：标签上有智能体名称的徽标", () => {
    const strip = show(
      sampleTab({ ownedByTab: false, attached: { agent: "Claude Code", startedAt: 1 } }),
    );
    expect(within(strip).getByText("Claude Code")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-26] 没有智能体名时徽标写“命令行”；标签页持有的没有徽标", () => {
    const strip = show(sampleTab({ ownedByTab: false, attached: { agent: null, startedAt: 1 } }));
    expect(within(strip).getByText("命令行")).toBeTruthy();
    cleanup();
    const mine = show(sampleTab());
    expect(within(mine).queryByText("命令行")).toBeNull();
  });
});

describe("窄窗口的运行条", () => {
  afterEach(() => {
    window.innerWidth = 1440;
  });

  it("[DESKTOP-WORKSPACE-65] 1024 宽：运行条只有圆点和“:7101”，没有“运行中”三个字；运行数只有数字", () => {
    window.innerWidth = 1024;
    show(sampleTab({ port: 7101 }));
    const bar = screen.getByRole("group", { name: "运行条" });
    expect(within(bar).getByText(":7101")).toBeTruthy();
    expect(within(bar).queryByText(/运行中/)).toBeNull();
    expect(within(bar).getByRole("button", { name: "重启" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "停止" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 个运行中" }).textContent).toBe("1");
  });

  it("[DESKTOP-WORKSPACE-65] 1440 宽：运行条写“运行中 :7101”，运行数写“1 个运行中”", () => {
    window.innerWidth = 1440;
    show(sampleTab({ port: 7101 }));
    const bar = screen.getByRole("group", { name: "运行条" });
    expect(within(bar).getByText("运行中 :7101")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 个运行中" }).textContent).toBe("1 个运行中");
  });

  it("项目标签页：标签条末尾有“＋”，右端没有蓝色的“新建”按钮", () => {
    show(sampleTab());
    expect(screen.getByRole("button", { name: "新建项目" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "新建" })).toBeNull();
  });
});
