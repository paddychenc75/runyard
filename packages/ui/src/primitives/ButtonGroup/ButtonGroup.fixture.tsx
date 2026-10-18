import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button, type ButtonSize } from "../Button/index.ts";
import { ButtonGroup } from "./ButtonGroup.tsx";

export const meta: FixtureMeta = {
  name: "ButtonGroup",
  layer: "primitive",
  boards: ["SpecControls"],
};

const sizes: readonly ButtonSize[] = ["lg", "md", "sm"];

// 每一档一排：主按钮和次按钮同高，只差颜色
export const samples: readonly FixtureSample[] = sizes.map((size) => ({
  name: `${size}-group`,
  render: (data) => (
    <FixtureStack direction="column">
      <ButtonGroup size={size}>
        <Button variant="primary" icon="refresh">
          {data.label}
        </Button>
        <Button>{data.label}</Button>
      </ButtonGroup>
      <ButtonGroup size={size}>
        <Button variant="destructive">{data.label}</Button>
        <Button variant="glass">{data.label}</Button>
      </ButtonGroup>
    </FixtureStack>
  ),
}));
