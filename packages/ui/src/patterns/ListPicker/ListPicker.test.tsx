import type { Localized } from "@runyard/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
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

describe("ListPicker 的分类栏和随高亮变的底部", () => {
  const rail = {
    label: name("categories"),
    items: [
      { id: "recent", label: name("recent"), count: 1, groupId: "recent" },
      { id: "all", label: name("all"), count: 2 },
      { id: "frontend", label: name("frontend"), count: 2, groupId: "frontend" },
      { id: "empty", label: name("empty"), count: 0, groupId: "none" },
    ],
  };
  function withRail(footer?: (id: string | undefined) => ReactNode) {
    const onChoose = vi.fn();
    render(
      <ListPicker
        label={name("templates")}
        groups={groups}
        rail={rail}
        footer={footer}
        chooseLabel={name("pick")}
        onChoose={onChoose}
        renderHeader={(props) => <SearchField {...props} label={name("search")} />}
      />,
    );
    return { onChoose, input: screen.getByRole("combobox", { name: "search" }) };
  }
  const nav = () => screen.getByRole("toolbar", { name: "categories" });
  const selected = () =>
    within(nav())
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-current") === "true")
      .map((button) => button.textContent);

  it("栏里的按钮写名称和个数；当前行所在分组的那一项选中，个数为 0 的点不了", () => {
    withRail();
    expect(
      within(nav())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["recent1", "all2", "frontend2", "empty0"]);
    expect(selected()).toEqual(["recent1"]);
    expect(within(nav()).getByRole("button", { name: /empty/ }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("方向键越过分组，选中的项跟着走；点一项把高亮放到那个分组的第一行，并把分组标题滚到顶部", async () => {
    const user = userEvent.setup();
    const scrolled: (Element | undefined)[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) {
      if ((arg as { block?: string } | undefined)?.block === "start") scrolled.push(this);
    };
    try {
      const { input } = withRail();
      await user.click(input);
      await user.keyboard("{ArrowDown}");
      expect(selected()).toEqual(["frontend2"]);
      await user.click(within(nav()).getByRole("button", { name: /recent/ }));
      expect(selected()).toEqual(["recent1"]);
      expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
      await user.click(within(nav()).getByRole("button", { name: /frontend/ }));
      expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
      expect(scrolled.at(-1)?.textContent).toBe("frontend");
      // 不带 groupId 的“全部”回到开头
      await user.click(within(nav()).getByRole("button", { name: /all/ }));
      expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(input);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("栏里的按钮不进 Tab 顺序；点它不把焦点从搜索框带走，回车仍选高亮行", async () => {
    const user = userEvent.setup();
    const { input, onChoose } = withRail();
    await user.click(input);
    for (const button of within(nav()).getAllByRole("button")) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
    await user.click(within(nav()).getByRole("button", { name: /frontend/ }));
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith("react19");
  });

  it("底部可以是函数：拿到高亮行的 id，随高亮变；没有行时是 undefined", async () => {
    const user = userEvent.setup();
    const footer = vi.fn((id: string | undefined) => <span>{`now:${id}`}</span>);
    const { input } = withRail(footer);
    expect(screen.getByText("now:vue3")).toBeTruthy();
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("now:react19")).toBeTruthy();
  });

  it("没有分组时底部拿到 undefined", () => {
    render(
      <ListPicker
        label={name("templates")}
        groups={[]}
        footer={(id) => <span>{`now:${String(id)}`}</span>}
        chooseLabel={name("pick")}
        onChoose={() => {}}
        renderHeader={(props) => <SearchField {...props} label={name("search")} />}
      />,
    );
    expect(screen.getByText("now:undefined")).toBeTruthy();
  });
});
