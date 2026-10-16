import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
      onValueChange={onValueChange}
      onClose={onClose}
      {...props}
    />,
  );
  return { onValueChange, onClose };
}

describe("TabStrip", () => {
  it("[DESKTOP-WORKSPACE-03] 资源库标签在第一位，没有关闭按钮，⌘W 和 Delete 在它上面都不起作用", async () => {
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

  it("[DESKTOP-WORKSPACE-03] 按下 ⌘W 时窗口不会因此关闭：按键被吞掉", () => {
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
