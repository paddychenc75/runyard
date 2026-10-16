import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { UserText } from "../../primitives/UserText/index.ts";
import { type TabStatus, TabStrip, type TabStripItem } from "./TabStrip.tsx";

export const meta: FixtureMeta = {
  name: "TabStrip",
  layer: "pattern",
  boards: ["Main", "MainDark", "MainNarrow"],
  backdrop: "colorful",
};

function project(data: SampleData, id: string, status: TabStatus): TabStripItem {
  return {
    id,
    label: <UserText>{data.userText}</UserText>,
    status,
    statusLabel: data.items[0],
    closeLabel: data.iconLabel,
  };
}

function pinned(data: SampleData): TabStripItem {
  return { id: "pinned", label: data.label, icon: "grid" };
}

const statuses: readonly TabStatus[] = ["running", "starting", "stopped", "crashed"];

export const samples: readonly FixtureSample[] = [
  {
    name: "pinned-only",
    render: (data) => (
      <FixtureBox>
        <TabStrip label={data.label} items={[pinned(data)]} value="pinned" />
      </FixtureBox>
    ),
  },
  {
    name: "pinned-selected",
    render: (data) => (
      <FixtureBox>
        <TabStrip
          label={data.label}
          items={[pinned(data), project(data, "a", "running"), project(data, "b", "running")]}
          value="pinned"
        />
      </FixtureBox>
    ),
  },
  {
    name: "project-selected",
    render: (data) => (
      <FixtureBox>
        <TabStrip
          label={data.label}
          items={[pinned(data), project(data, "a", "running"), project(data, "b", "running")]}
          value="a"
        />
      </FixtureBox>
    ),
  },
  {
    name: "statuses",
    render: (data) => (
      <FixtureBox>
        <TabStrip
          label={data.label}
          items={[pinned(data), ...statuses.map((status) => project(data, status, status))]}
          value="running"
        />
      </FixtureBox>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureBox>
        <TabStrip
          label={data.label}
          items={[
            pinned(data),
            {
              id: "long",
              label: <UserText>{data.longLabel}</UserText>,
              status: "running",
              closeLabel: data.iconLabel,
            },
          ]}
          value="long"
        />
      </FixtureBox>
    ),
  },
];
