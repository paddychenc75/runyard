import { describe, expect, it, vi } from "vitest";
import { chooseNavFilter, showLibrary } from "./sidebar-navigation.ts";

describe("点侧栏的一项", () => {
  it("[DESKTOP-LIBRARY-VIEW-64] 在项目标签页点筛选：筛选生效，并且切到资源库标签", () => {
    const patchQuery = vi.fn();
    const selectTab = vi.fn();
    chooseNavFilter("agent", { activeTab: "demo", patchQuery, selectTab });
    expect(patchQuery).toHaveBeenCalledWith({ nav: "agent" });
    expect(selectTab).toHaveBeenCalledWith("library");
  });

  it("已经在资源库标签时不再重复切换", () => {
    const selectTab = vi.fn();
    chooseNavFilter("running", { activeTab: "library", patchQuery: vi.fn(), selectTab });
    showLibrary({ activeTab: "library", selectTab });
    expect(selectTab).not.toHaveBeenCalled();
  });

  it("[DESKTOP-LIBRARY-VIEW-64] 模板页面项也先回到资源库标签；设置另开窗口不调用此函数", () => {
    const selectTab = vi.fn();
    showLibrary({ activeTab: "demo", selectTab });
    expect(selectTab).toHaveBeenCalledWith("library");
  });
});
