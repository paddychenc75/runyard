import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "../../primitives/SearchField/index.ts";
import { ListPicker, type ListPickerGroup } from "./ListPicker.tsx";

const name = (text: string) => text as Localized;
const groups: ListPickerGroup[] = [
  {
    id: "recent",
    title: name("recent"),
    items: [{ id: "vue3", title: "Vue", letters: "Vu" }],
  },
  {
    id: "frontend",
    title: name("frontend"),
    items: [
      { id: "react19", title: "React", subtitle: "sub", letters: "Re" },
      { id: "vue3", title: "Vue", letters: "Vu" },
    ],
  },
];

function setup(onChoose = vi.fn()) {
  render(
    <ListPicker
      label={name("templates")}
      groups={groups}
      chooseLabel={name("pick")}
      onChoose={onChoose}
      renderHeader={(props) => <SearchField {...props} label={name("search")} />}
    />,
  );
  return { onChoose, input: screen.getByRole("combobox", { name: "search" }) };
}

describe("ListPicker", () => {
  it("按分组列出行，默认高亮第一行，搜索框指向它", () => {
    const { input } = setup();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    expect(screen.getByRole("listbox", { name: "templates" })).toBeTruthy();
  });

  it("焦点留在搜索框，方向键移动高亮，回车选择高亮行；同一项在两个分组里各有一行", async () => {
    const user = userEvent.setup();
    const { onChoose, input } = setup();
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByRole("option")[2]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith("vue3");
  });

  it("到头不再移动；Home 和 End 跳到首尾", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    expect(screen.getAllByRole("option")[2]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}");
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("点击一行就选择它；高亮行显示选择文字", async () => {
    const user = userEvent.setup();
    const { onChoose } = setup();
    expect(screen.getByText("pick")).toBeTruthy();
    await user.click(screen.getAllByRole("option")[1] as HTMLElement);
    expect(onChoose).toHaveBeenCalledWith("react19");
  });

  it("输入法组词时回车和方向键不属于列表", async () => {
    const { onChoose, input } = setup();
    input.focus();
    const down = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true });
    input.dispatchEvent(down);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("列表内容变了（如搜索过滤）高亮回到第一行", async () => {
    const user = userEvent.setup();
    const view = render(
      <ListPicker
        label={name("templates")}
        groups={groups}
        chooseLabel={name("pick")}
        onChoose={() => {}}
        renderHeader={(props) => <SearchField {...props} label={name("search")} />}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: "search" }), "{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]?.getAttribute("aria-selected")).toBe("true");
    view.rerender(
      <ListPicker
        label={name("templates")}
        groups={groups.slice(1)}
        chooseLabel={name("pick")}
        onChoose={() => {}}
        renderHeader={(props) => <SearchField {...props} label={name("search")} />}
      />,
    );
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });
});
