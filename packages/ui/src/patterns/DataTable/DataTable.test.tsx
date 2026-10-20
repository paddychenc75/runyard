import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Localized } from "@runyard/i18n";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";

const text = (value: string) => value as Localized;

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: text("Name"), width: "fill", render: (row) => row.name },
  { id: "port", header: text("Port"), width: "sm", render: () => "7101" },
  {
    id: "actions",
    hiddenHeader: text("Actions"),
    width: "icon",
    reveal: true,
    render: () => <button type="button">more</button>,
  },
];
const rows: Row[] = [
  { id: "a", name: "alpha" },
  { id: "b", name: "beta" },
];

function setup(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(
    <DataTable
      label={text("Table")}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      {...props}
    />,
  );
}

describe("DataTable", () => {
  it("是一张有名字的表：表头、行、单元格各有角色", () => {
    setup();
    const table = screen.getByRole("table", { name: "Table" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("cell", { name: "alpha" })).toBeTruthy();
  });

  it("行内编辑：编辑中的行有标记，输入格可以向右占列，被占掉的格不画", () => {
    const { container } = setup({
      editingId: "a",
      cellSpan: (row, columnId) => (row.id === "a" && columnId === "name" ? 2 : 1),
    });
    const editing = container.querySelector("[data-row-id=a]");
    expect(editing?.hasAttribute("data-editing")).toBe(true);
    expect(editing?.querySelectorAll("td")).toHaveLength(2);
    expect(editing?.querySelector("[data-column=name]")?.getAttribute("data-span")).toBe("2");
    expect(editing?.querySelector("[data-column=port]")).toBeNull();
    expect(container.querySelector("[data-row-id=b]")?.querySelectorAll("td")).toHaveLength(3);
  });

  it("没有可见表头的列用 hiddenHeader 当名字", () => {
    setup();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeTruthy();
  });

  it("按行的顺序画；选中的行有标记", () => {
    const { container } = setup({ selectedId: "b" });
    const ids = [...container.querySelectorAll("[data-row-id]")].map((n) =>
      n.getAttribute("data-row-id"),
    );
    expect(ids).toEqual(["a", "b"]);
    expect(container.querySelector("[data-row-id=b]")?.hasAttribute("data-selected")).toBe(true);
    expect(container.querySelector("[data-row-id=a]")?.hasAttribute("data-selected")).toBe(false);
  });

  it("单击和双击行时带上这一行的数据", async () => {
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    setup({ onRowClick, onRowDoubleClick });
    await userEvent.dblClick(screen.getByRole("cell", { name: "beta" }));
    expect(onRowClick.mock.calls[0]?.[0]).toEqual(rows[1]);
    expect(onRowDoubleClick.mock.calls[0]?.[0]).toEqual(rows[1]);
  });

  it("表格自己是一个 Tab 停点，没有行内固定的列", () => {
    const { container } = setup();
    expect(container.querySelector("table")?.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector("[data-pin]")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-95] 带 reveal 的列只在悬停、选中或焦点进入这一行时标成显示，按钮一直在无障碍树里", async () => {
    const { container, rerender } = setup();
    const revealed = (id: string) =>
      container.querySelector(`[data-row-id=${id}]`)?.hasAttribute("data-revealed");
    expect(container.querySelector("[data-row-id=a] td[data-reveal]")).not.toBeNull();
    expect(revealed("a")).toBe(false);
    // 隐藏只用 opacity，读屏器仍能找到每行的按钮
    expect(screen.getAllByRole("button", { name: "more" })).toHaveLength(2);
    await userEvent.hover(screen.getByRole("cell", { name: "alpha" }));
    expect(revealed("a")).toBe(true);
    expect(revealed("b")).toBe(false);
    await userEvent.unhover(screen.getByRole("cell", { name: "alpha" }));
    expect(revealed("a")).toBe(false);
    rerender(
      <DataTable
        label={text("Table")}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        selectedId="a"
      />,
    );
    expect(revealed("a")).toBe(true);
    // 键盘焦点进入另一行里的按钮
    act(() => screen.getAllByRole("button", { name: "more" })[1]?.focus());
    expect(revealed("b")).toBe(true);
  });

  it("行下面可以接一条通栏说明：占满整行宽，带色调，不算数据行", () => {
    const { container } = setup({
      renderDetail: (row) => (row.id === "a" ? { content: "note-a", tone: "warning" } : null),
    });
    const detail = container.querySelector("[data-detail-for=a]");
    expect(detail?.getAttribute("data-tone")).toBe("warning");
    expect(detail?.textContent).toBe("note-a");
    expect(detail?.querySelector("td")?.getAttribute("colspan")).toBe("3");
    expect(detail?.previousElementSibling?.getAttribute("data-row-id")).toBe("a");
    expect(container.querySelector("[data-detail-for=b]")).toBeNull();
    expect(container.querySelectorAll("[data-row-id]")).toHaveLength(2);
  });

  it("[#348] 表头和每一行用同一套列定义：列数、顺序逐列一致，共用一个 grid-template-columns", () => {
    const { container } = setup();
    const heads = [...container.querySelectorAll("thead th")];
    expect(heads).toHaveLength(columns.length);
    for (const tr of container.querySelectorAll("tbody tr[data-row-id]")) {
      const cells = [...tr.querySelectorAll("td")];
      expect(cells.map((td) => td.getAttribute("data-column"))).toEqual(
        columns.map((column) => column.id),
      );
      expect(cells.map((td) => td.getAttribute("data-column"))).toEqual(
        heads.map((th) => th.getAttribute("data-column")),
      );
    }
    // 版面轨道只在 table 上定义一次，表头行和数据行的 .row 都读它（jsdom 不排版，位置由真实窗口里的检查看）
    const table = container.querySelector("table") as HTMLElement;
    expect(table.style.getPropertyValue("--table-columns").split(" ").length).toBeGreaterThan(
      columns.length - 1,
    );
    const css = readFileSync(join(import.meta.dirname, "DataTable.module.css"), "utf8");
    expect(css).toMatch(/\.row \{[^}]*grid-template-columns: var\(--table-columns\)/);
  });
});

describe("DataTable 放不下时按顺序收列（DESKTOP-LIBRARY-VIEW-28、29）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  interface R {
    id: string;
  }
  const collapsible: DataTableColumn<R>[] = [
    { id: "name", header: text("Name"), width: "fill", render: () => "n" },
    {
      id: "template",
      header: text("Template"),
      width: "flex",
      collapse: { order: 3, mode: "narrow" },
      render: (_row, { collapsed }) => (collapsed ? "badge" : "badge name"),
    },
    {
      id: "port",
      header: text("Port"),
      width: "sm",
      collapse: { order: 2, mode: "hide" },
      render: () => "7101",
    },
    {
      id: "used",
      header: text("Used"),
      width: "md",
      collapse: { order: 1, mode: "hide" },
      render: () => "1h",
    },
    { id: "clean", header: text("Clean"), width: "lg", render: () => "-" },
  ];

  // 假的布局：每个可见列最小 200，模板收窄后 50；可见宽度由测试给，ResizeObserver 由测试手动触发
  function fakeLayout() {
    const layout = { viewport: 1100 };
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => layout.viewport);
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      if (element.tagName !== "TABLE") return real(element);
      const narrow = element.querySelector("th[data-column=template][data-collapsed]") !== null;
      const heads = element.querySelectorAll("th").length;
      return { minWidth: `${heads * 200 - (narrow ? 150 : 0)}px` } as CSSStyleDeclaration;
    });
    const resize = (width: number) => {
      layout.viewport = width;
      act(() => {
        for (const callback of callbacks) callback();
      });
    };
    return { resize };
  }

  const headers = () =>
    [...document.querySelectorAll("thead th")].map((th) => th.getAttribute("data-column"));

  const table = () => (
    <DataTable
      label={text("Table")}
      columns={collapsible}
      rows={[{ id: "a" }]}
      getRowId={(row) => row.id}
    />
  );

  it("放得下时全部显示；窄了先收“最近使用”，再收端口，再把模板收成徽标，不横向滚动；变宽后按相反顺序恢复", () => {
    const { resize } = fakeLayout();
    render(table());
    expect(headers()).toEqual(["name", "template", "port", "used", "clean"]);
    resize(900);
    expect(headers()).toEqual(["name", "template", "port", "clean"]);
    resize(700);
    expect(headers()).toEqual(["name", "template", "clean"]);
    resize(500);
    expect(headers()).toEqual(["name", "template", "clean"]);
    expect(document.querySelector("[data-column=template][data-collapsed]")).not.toBeNull();
    expect(screen.getByRole("cell", { name: "badge" })).toBeTruthy();
    resize(700);
    expect(headers()).toEqual(["name", "template", "clean"]);
    expect(document.querySelector("[data-column=template][data-collapsed]")).toBeNull();
    resize(900);
    expect(headers()).toEqual(["name", "template", "port", "clean"]);
    resize(1100);
    expect(headers()).toEqual(["name", "template", "port", "used", "clean"]);
  });

  it("被收起的列记在根元素的 data-collapsed 上，供样式显示“收起后才出现”的内容", () => {
    const { resize } = fakeLayout();
    const { container } = render(table());
    expect(container.querySelector("[data-collapsed]")).toBeNull();
    resize(700);
    expect(container.firstElementChild?.getAttribute("data-collapsed")).toBe("used port");
  });
});
