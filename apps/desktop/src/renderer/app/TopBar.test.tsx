// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
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
        search=""
        onSearchChange={() => {}}
        searchRef={createRef()}
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
