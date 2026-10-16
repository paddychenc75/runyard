import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { UserText } from "../../primitives/UserText/index.ts";
import { TitleBar, type TitleBarControls } from "./TitleBar.tsx";

export const meta: FixtureMeta = {
  name: "TitleBar",
  layer: "pattern",
  boards: ["Main", "MainDark"],
};

const placements: readonly TitleBarControls[] = ["start", "end", "none"];

export const samples: readonly FixtureSample[] = [
  ...placements.map(
    (controls): FixtureSample => ({
      name: `controls-${controls}`,
      render: (data) => (
        <FixtureBox>
          <TitleBar controls={controls}>
            <UserText>{data.label}</UserText>
          </TitleBar>
        </FixtureBox>
      ),
    }),
  ),
  {
    name: "long-label",
    render: (data) => (
      <FixtureFrame>
        <TitleBar>
          <UserText>{data.longLabel}</UserText>
        </TitleBar>
      </FixtureFrame>
    ),
  },
];
