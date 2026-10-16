import type { Localized } from "@runyard/i18n";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { Badge } from "../../primitives/Badge/index.ts";
import { IconButton } from "../../primitives/IconButton/index.ts";
import { StatusMark } from "../../primitives/StatusMark/index.ts";
import { Truncate } from "../../primitives/Truncate/index.ts";
import { UserText } from "../../primitives/UserText/index.ts";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";

export const meta: FixtureMeta = {
  name: "DataTable",
  layer: "pattern",
  boards: ["Main", "MainDark", "MainNarrow"],
};

interface SampleRow {
  id: string;
  name: string;
  running: boolean;
}

function columns(data: SampleData): DataTableColumn<SampleRow>[] {
  return [
    {
      id: "name",
      header: data.items[0],
      width: "fill",
      pin: "start",
      render: (row) => (
        <Truncate>
          <UserText>{row.name}</UserText>
        </Truncate>
      ),
    },
    {
      id: "status",
      header: data.items[1],
      width: "xl",
      render: (row) => (
        <StatusMark status={row.running ? "running" : "stopped"}>{data.items[1]}</StatusMark>
      ),
    },
    {
      id: "keep",
      header: data.items[2],
      width: "md",
      render: () => <Badge variant="dashed">{data.items[2]}</Badge>,
    },
    {
      id: "info",
      header: data.items[3],
      width: "flex",
      render: () => <Truncate>{data.longLabel}</Truncate>,
    },
    {
      id: "actions",
      hiddenHeader: data.label,
      width: "icon",
      pin: "end",
      render: () => <IconButton icon="close" label={data.iconLabel as Localized} size="sm" />,
    },
  ];
}

const rows = (data: SampleData): SampleRow[] => [
  { id: "a", name: data.userText, running: true },
  { id: "b", name: `${data.userText}-2`, running: false },
  { id: "c", name: `${data.userText}-3`, running: false },
];

export const samples: readonly FixtureSample[] = [
  {
    name: "default",
    render: (data) => (
      <DataTable
        label={data.label}
        columns={columns(data)}
        rows={rows(data)}
        getRowId={(r) => r.id}
      />
    ),
  },
  {
    name: "selected-row",
    render: (data) => (
      <DataTable
        label={data.label}
        columns={columns(data)}
        rows={rows(data)}
        getRowId={(r) => r.id}
        selectedId="a"
      />
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <DataTable
        label={data.label}
        columns={columns(data)}
        rows={[{ id: "a", name: data.longLabel, running: true }]}
        getRowId={(r) => r.id}
      />
    ),
  },
];
