import type { Localized } from "@runyard/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabStrip, type TabStripItem } from "./TabStrip.tsx";

const text = (value: string) => value as Localized;

const library: TabStripItem = { id: "library", label: text("Library"), icon: "grid" };
const demo: TabStripItem = {
  id: "demo",
  label: "demo",
  status: "running",
  closeLabel: text("Close and stop"),
};
const other: TabStripItem = { ...demo, id: "other", label: "other" };

function setup(
  props: Partial<React.ComponentProps<typeof TabStrip>> = {},
  items: TabStripItem[] = [library, demo, other],
) {
  const onValueChange = vi.fn();
  const onClose = vi.fn();
  render(
    <TabStrip
      label={text("Tabs")}
      items={items}
      value="library"
      data-test-root=""
      onValueChange={onValueChange}
      onClose={onClose}
      {...props}
    />,
  );
  return { onValueChange, onClose };
}

describe("TabStrip", () => {
  it("不可关闭的固定项没有关闭按钮，⌘W 和 Delete 在它上面都不起作用", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.textContent).toBe("Library");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    // 关闭按钮只属于项目标签：两个项目标签各一个，资源库没有
    expect(screen.getAllByRole("button", { name: "Close and stop" })).toHaveLength(2);
    tabs[0]?.focus();
    await user.keyboard("{Delete}");
    await user.keyboard("{Meta>}w{/Meta}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("当前项不可关闭时按下 ⌘W 不会关闭窗口：按键被吞掉", () => {
    setup();
    const event = new KeyboardEvent("keydown", {
      key: "w",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("[DESKTOP-WORKSPACE-03] 没有当前项目时首个可见标签仍可键盘进入，且不误选或关闭项目", async () => {
    const user = userEvent.setup();
    const { onClose, onValueChange } = setup({ value: "library" }, [demo, other]);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "demo" }));
    expect(screen.queryByRole("tab", { selected: true })).toBeNull();
    await user.keyboard("{Meta>}w{/Meta}");
    expect(onClose).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("demo");
  });

  it("是带名字的 tablist，当前标签 aria-selected，只有它在 Tab 顺序里", async () => {
    const user = userEvent.setup();
    setup({ value: "demo" });
    expect(screen.getByRole("tablist", { name: "Tabs" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /demo/ }).getAttribute("aria-selected")).toBe("true");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /demo/ }));
  });

  it("方向键、Home、End 只移动焦点（循环），Enter 才切换", async () => {
    const user = userEvent.setup();
    const { onValueChange } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /demo/ }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /other/ }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Library" }));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /other/ }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Library" }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("demo");
  });

  it("点标签以它的 id 通知 onValueChange", async () => {
    const user = userEvent.setup();
    const { onValueChange } = setup();
    await user.click(screen.getByRole("tab", { name: /other/ }));
    expect(onValueChange).toHaveBeenCalledWith("other");
  });

  it("点关闭按钮、在标签上按 Delete、按 ⌘W 都以当前标签的 id 通知 onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = setup({ value: "demo" });
    await user.click(screen.getAllByRole("button", { name: "Close and stop" })[1] as HTMLElement);
    expect(onClose).toHaveBeenLastCalledWith("other");
    screen.getByRole("tab", { name: /demo/ }).focus();
    await user.keyboard("{Delete}");
    expect(onClose).toHaveBeenLastCalledWith("demo");
    await user.keyboard("{Meta>}w{/Meta}");
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onClose).toHaveBeenLastCalledWith("demo");
  });

  it("modKey 为 ctrl 时认 Ctrl+W，不认 ⌘W", async () => {
    const user = userEvent.setup();
    const { onClose } = setup({ value: "demo", modKey: "ctrl" });
    await user.keyboard("{Meta>}w{/Meta}");
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Control>}w{/Control}");
    expect(onClose).toHaveBeenCalledWith("demo");
  });

  it("关闭按钮不进 Tab 顺序，状态圆点有说明时是图片，没有时对读屏器隐藏", () => {
    setup({}, [library, { ...demo, statusLabel: text("Running") }, other]);
    expect(screen.getAllByRole("button", { name: "Close and stop" })[0]?.tabIndex).toBe(-1);
    expect(screen.getByRole("img", { name: "Running" })).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("关闭按钮的名字传普通字符串是类型错误", () => {
    const typeOnly = (): TabStripItem => ({
      id: "a",
      label: "a",
      // @ts-expect-error #168 closeLabel 只收 Localized
      closeLabel: "plain",
    });
    expect(typeOnly).toBeTypeOf("function");
  });
});

// jsdom 没有版面：用假的宽度顶替。每个标签 120 宽，标签条根 root 宽 rootWidth，“＋”按钮 36 宽
describe("TabStrip 放不下时折进“+N”", () => {
  let rootWidth = 0;
  const widthOf = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const clientOf = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (this.dataset.tabId !== undefined) return 120;
        // “＋”新建按钮外面的那层
        return this.tagName === "SPAN" && this.querySelector("button") !== null ? 36 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testRoot === undefined ? 0 : rootWidth;
      },
    });
  });
  afterEach(() => {
    if (widthOf !== undefined) Object.defineProperty(HTMLElement.prototype, "offsetWidth", widthOf);
    if (clientOf !== undefined)
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientOf);
  });

  const six: TabStripItem[] = [
    library,
    ...["a", "b", "c", "d", "e"].map((id) => ({ ...demo, id, label: id, menuLabel: text(id) })),
  ];
  const folded = () =>
    Array.from(document.querySelectorAll("[data-folded]")).map((node) =>
      node.getAttribute("data-tab-id"),
    );
  const more = () => screen.queryByRole("button", { name: "更多标签页" });

  it("[DESKTOP-WORKSPACE-63] 放不下的标签折进“+N”，N 是个数；列表里是折进去的，选一个就切过去", async () => {
    rootWidth = 120 * 3 + 36 + 70; // 三个标签、“＋”和“+N”按钮
    const user = userEvent.setup();
    const { onValueChange } = setup(
      { overflowLabel: text("更多标签页"), add: { label: text("新建"), onClick: () => {} } },
      six,
    );
    expect(folded()).toEqual(["c", "d", "e"]);
    expect(more()?.textContent).toBe("+3");
    await user.click(more() as HTMLElement);
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["c", "d", "e"]);
    await user.click(within(menu).getByRole("menuitem", { name: "d" }));
    expect(onValueChange).toHaveBeenCalledWith("d");
  });

  it("[DESKTOP-WORKSPACE-64] 选中折进去的标签后它出现在条上，“+N”里不再有它；窗口变宽时都回来", () => {
    rootWidth = 120 * 3 + 36 + 70;
    const { rerender } = render(
      <TabStrip
        label={text("Tabs")}
        items={six}
        value="library"
        overflowLabel={text("更多标签页")}
        data-test-root=""
      />,
    );
    expect(folded()).toEqual(["c", "d", "e"]);
    rerender(
      <TabStrip
        label={text("Tabs")}
        items={six}
        value="e"
        overflowLabel={text("更多标签页")}
        data-test-root=""
      />,
    );
    expect(folded()).not.toContain("e");
    expect(folded()).toHaveLength(3);
    expect(more()?.textContent).toBe("+3");
    rootWidth = 2000;
    rerender(
      <TabStrip
        label={text("Tabs")}
        items={six}
        value="e"
        overflowLabel={text("更多标签页")}
        data-test-root=""
      />,
    );
    expect(folded()).toEqual([]);
    expect(more()).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-63] 压窄（名字省略）就放得下时，不折叠、资源库也保留文字", () => {
    rootWidth = 700 + 36; // 完整宽度 720 放不下，最窄 680 放得下
    setup({ overflowLabel: text("更多标签页"), add: { label: text("新建"), onClick: () => {} } }, [
      { ...six[0], shrinkToIcon: true } as TabStripItem,
      ...six.slice(1),
    ]);
    expect(folded()).toEqual([]);
    expect(more()).toBeNull();
    expect(document.querySelector("[data-icon-only]")).toBeNull();
    expect(document.querySelector("[data-shrunk]")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-63] 窄到压窄也放不下时，资源库标签先缩成只剩图标，悬停提示写“资源库”", () => {
    rootWidth = 120 * 5 + 36; // 六个标签差一点：缩掉资源库的文字就够了
    setup(
      {
        overflowLabel: text("更多标签页"),
        add: { label: text("新建"), onClick: () => {} },
      },
      [
        { ...six[0], shrinkToIcon: true, menuLabel: text("资源库") } as TabStripItem,
        ...six.slice(1),
      ],
    );
    const tab = screen.getAllByRole("tab")[0] as HTMLElement;
    expect(tab.getAttribute("title")).toBe("资源库");
    expect(tab.closest("[data-icon-only]")).toBeTruthy();
    expect(folded()).toEqual([]);
  });
});
