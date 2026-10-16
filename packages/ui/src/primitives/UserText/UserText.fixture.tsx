import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { UserText } from "./UserText.tsx";

export const meta: FixtureMeta = {
  name: "UserText",
  layer: "primitive",
  boards: ["SpecType"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "default",
    render: (data) => <UserText>{data.label}</UserText>,
  },
  {
    name: "mono",
    render: (data) => <UserText mono>{data.label}</UserText>,
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack direction="column">
        <UserText>{data.longLabel}</UserText>
        <UserText mono>{data.longLabel}</UserText>
      </FixtureStack>
    ),
  },
];
