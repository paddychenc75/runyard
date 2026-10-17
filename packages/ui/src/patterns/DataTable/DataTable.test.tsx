import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Localized } from "@runyard/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";

const text = (value: string) => value as Localized;

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: text("Name"), width: "fill", pin: "start", render: (row) => row.name },
  { id: "port", header: text("Port"), width: "sm", render: () => "7101" },
  { id: "actions", hiddenHeader: text("Actions"), width: "icon", pin: "end", render: () => "..." },
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

  it("固定的列带 data-pin，样式据此固定在两侧", () => {
    const { container } = setup();
    expect(container.querySelector("[data-pin=start]")).not.toBeNull();
    expect(container.querySelector("[data-pin=end]")).not.toBeNull();
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

  it("[#348] 表头和每一行用同一套列定义：列数、顺序、固定方式逐列一致，共用一个 grid-template-columns", () => {
    const { container } = setup();
    const heads = [...container.querySelectorAll("thead th")];
    expect(heads).toHaveLength(columns.length);
    expect(heads.map((th) => th.getAttribute("data-pin"))).toEqual(
      columns.map((column) => column.pin ?? null),
    );
    for (const tr of container.querySelectorAll("tbody tr[data-row-id]")) {
      const cells = [...tr.querySelectorAll("td")];
      expect(cells.map((td) => td.getAttribute("data-column"))).toEqual(
        columns.map((column) => column.id),
      );
      expect(cells.map((td) => td.getAttribute("data-pin"))).toEqual(
        heads.map((th) => th.getAttribute("data-pin")),
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

  it("[#348] 窗口放不下时固定列的圆角收成直角，不漏出底下滚过去的列", () => {
    const css = readFileSync(join(import.meta.dirname, "DataTable.module.css"), "utf8");
    expect(css).toMatch(/\.root\[data-overflowing\] \.row > \[data-pin\] \{[^}]*border-radius: 0/);
  });
});
