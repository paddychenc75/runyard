import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Badge } from "./Badge.tsx";

export const meta: FixtureMeta = {
  name: "Badge",
  layer: "primitive",
  boards: ["Main", "MainDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "variants",
    render: (data) => (
      <FixtureStack>
        <Badge variant="solid">{data.items[0]}</Badge>
        <Badge variant="dashed">{data.items[1]}</Badge>
        <Badge variant="violet" icon="spark">
          {data.items[2]}
        </Badge>
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <Badge variant="violet" icon="spark">
        {data.longLabel}
      </Badge>
    ),
  },
];
