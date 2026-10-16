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
});
