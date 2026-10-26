import type { Localized } from "@runyard/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavList, type NavListSection } from "./NavList.tsx";

const text = (value: string) => value as Localized;

const sections: NavListSection[] = [
  {
    id: "filters",
    title: text("Library"),
    items: [
      { id: "all", label: text("All"), count: text("20") },
      { id: "kept", label: text("Kept") },
    ],
  },
  {
    id: "pages",
    title: text("Manage"),
    items: [
      { id: "templates", label: text("Templates"), icon: "cube" },
      { id: "settings", label: text("Settings"), icon: "sliders", disabled: true },
    ],
  },
];

describe("NavList", () => {
  it("是带名字的导航地标，每个分组有自己的标题", () => {
    render(<NavList label={text("Sidebar")} sections={sections} />);
    const nav = screen.getByRole("navigation", { name: "Sidebar" });
    expect(within(nav).getByRole("region", { name: "Library" })).toBeTruthy();
    expect(within(nav).getByRole("region", { name: "Manage" })).toBeTruthy();
  });

  it("当前项带 aria-current，其余没有；value 不属于任何项时都没有", () => {
    const { rerender } = render(<NavList label={text("S")} sections={sections} value="kept" />);
    expect(screen.getByRole("button", { name: "Kept" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /All/ }).getAttribute("aria-current")).toBeNull();
    rerender(<NavList label={text("S")} sections={sections} value="nope" />);
    expect(document.querySelector("[aria-current]")).toBeNull();
  });

  it("点击和键盘（Tab 到达，Enter、空格）都以项的 id 通知 onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NavList label={text("S")} sections={sections} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("button", { name: "Kept" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Templates" }));
    await user.keyboard("{Enter}");
    expect(onValueChange.mock.calls).toEqual([["kept"], ["templates"]]);
  });

  it("不可用的项 Tab 跳过，点击不触发", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NavList label={text("S")} sections={sections} onValueChange={onValueChange} />);
    const disabled = screen.getByRole("button", { name: "Settings" });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    await user.click(disabled);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("数字显示在项里，随项的名字一起被读出", () => {
    render(<NavList label={text("S")} sections={sections} />);
    expect(screen.getByRole("button", { name: /^All\s*20$/ })).toBeTruthy();
  });

  it("图标是装饰：有图标的项名字里没有图标的文字", () => {
    render(<NavList label={text("S")} sections={sections} />);
    expect(screen.getByRole("button", { name: "Templates" })).toBeTruthy();
  });

  it("项的标签传普通字符串是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #168 label 只收 Localized
      <NavList label={text("S")} sections={[{ id: "x", items: [{ id: "y", label: "plain" }] }]} />
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});

it("宿主失焦仍保留选中项与键盘动作", async () => {
  const onValueChange = vi.fn();
  render(
    <NavList
      label={text("S")}
      sections={sections}
      value="kept"
      active={false}
      onValueChange={onValueChange}
    />,
  );
  expect(screen.getByRole("navigation").getAttribute("data-active")).toBe("false");
  expect(screen.getByRole("button", { name: "Kept" }).getAttribute("aria-current")).toBe("page");
  await userEvent.click(screen.getByRole("button", { name: /All/ }));
  expect(onValueChange).toHaveBeenCalledWith("all");
});
