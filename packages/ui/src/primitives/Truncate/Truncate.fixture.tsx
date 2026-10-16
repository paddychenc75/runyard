import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Truncate } from "./Truncate.tsx";

export const meta: FixtureMeta = {
  name: "Truncate",
  layer: "primitive",
  boards: ["Main"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "short",
    render: (data) => (
      <FixtureBox>
        <Truncate>{data.label}</Truncate>
      </FixtureBox>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureBox>
        <Truncate>{data.longLabel}</Truncate>
      </FixtureBox>
    ),
  },
];
