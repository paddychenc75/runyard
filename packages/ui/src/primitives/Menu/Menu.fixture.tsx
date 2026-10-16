import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { IconButton } from "../IconButton/index.ts";
import styles from "./Menu.fixture.module.css";
import { Menu, type MenuEntry } from "./Menu.tsx";

export const meta: FixtureMeta = {
  name: "Menu",
  layer: "primitive",
  boards: ["SpecControls", "RowMenu"],
  backdrop: "colorful",
};

const entries = (data: SampleData, long = false): MenuEntry[] => [
  { id: "a", label: long ? data.longLabel : data.items[0], hint: data.label },
  { id: "b", label: data.items[1] },
  { type: "separator" },
  { id: "c", label: data.items[2], disabled: true },
  { id: "d", label: data.items[3], tone: "danger" },
];

const noop = () => {};

const sample = (name: string, long = false): FixtureSample => ({
  name,
  render: (data) => (
    <FixtureBox>
      <div className={styles.stage}>
        <Menu
          label={data.label}
          trigger={<IconButton icon="more" label={data.iconLabel} />}
          entries={entries(data, long)}
          onSelect={noop}
          defaultOpen={name !== "closed"}
        />
      </div>
    </FixtureBox>
  ),
});

export const samples: readonly FixtureSample[] = [
  sample("closed"),
  sample("open"),
  sample("long-label", true),
];
