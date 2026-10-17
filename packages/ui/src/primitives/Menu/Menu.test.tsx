import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../IconButton/index.ts";
import { Menu, type MenuEntry } from "./Menu.tsx";

const l = (text: string) => text as Localized;
const entries: MenuEntry[] = [
  { id: "open", label: l("open"), hint: l("enter") },
  { id: "disabled", label: l("nope"), disabled: true },
  { type: "separator" },
  { id: "danger", label: l("remove"), tone: "danger" },
];

function setup(props: { onSelect?: (id: string) => void; onOpenChange?: (o: boolean) => void }) {
  return render(
    <Menu
      label={l("more actions")}
      trigger={<IconButton icon="more" label={l("more")} />}
      entries={entries}
      onSelect={props.onSelect ?? (() => {})}
      onOpenChange={props.onOpenChange}
    />,
  );
}

describe("Menu", () => {
  it("点触发按钮打开菜单，选中一项回调它的 id 并关闭", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    setup({ onSelect });
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "more" }));
    expect(await screen.findByRole("menu", { name: "more actions" })).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: /open/ }));
    expect(onSelect).toHaveBeenCalledWith("open");
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("键盘：回车打开，方向键移动，回车选中，Escape 关闭且不回调", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    setup({ onSelect });
    await user.tab();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    await vi.waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    // 打开后第一项被高亮；禁用项仍可聚焦（读屏器要读到），回车无效，所以按两次到“remove”
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe("remove"));
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith("danger"));
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("禁用的项不能选，开合变化通知 onOpenChange", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    setup({ onSelect, onOpenChange });
    await user.click(screen.getByRole("button", { name: "more" }));
    await screen.findByRole("menu");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("menuitem", { name: "nope" }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
  });

  it("单选菜单：带 checked 的项读成 menuitemradio，当前值是选中", async () => {
    const user = userEvent.setup();
    render(
      <Menu
        label={l("sort")}
        trigger={<IconButton icon="more" label={l("more")} />}
        entries={[
          { id: "recent", label: l("recent"), checked: true },
          { id: "name", label: l("name"), checked: false },
        ]}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "more" }));
    const recent = await screen.findByRole("menuitemradio", { name: "recent" });
    expect(recent.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "name" }).getAttribute("aria-checked")).toBe(
      "false",
    );
  });
});
