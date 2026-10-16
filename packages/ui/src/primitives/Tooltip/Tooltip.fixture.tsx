import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { IconButton } from "../IconButton/index.ts";
import { Tooltip } from "./Tooltip.tsx";

export const meta: FixtureMeta = {
  name: "Tooltip",
  layer: "primitive",
  boards: ["SpecControls", "SpecMaterial"],
  backdrop: "colorful",
};

export const samples: readonly FixtureSample[] = [
  {
    name: "closed",
    render: (data) => (
      <FixtureBox>
        <Tooltip content={data.label}>
          <IconButton icon="close" label={data.iconLabel} />
        </Tooltip>
      </FixtureBox>
    ),
  },
  {
    name: "open",
    render: (data) => (
      <FixtureBox>
        <Tooltip content={data.label} open>
          <IconButton icon="close" label={data.iconLabel} />
        </Tooltip>
      </FixtureBox>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureBox>
        <Tooltip content={data.longLabel} open>
          <IconButton icon="close" label={data.iconLabel} />
        </Tooltip>
      </FixtureBox>
    ),
  },
];
