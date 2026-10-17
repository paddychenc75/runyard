import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Kbd } from "../Kbd/Kbd.tsx";

export const meta: FixtureMeta = {
  name: "ZzDummy",
  layer: "primitive",
  boards: ["Picker", "PickerDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "default",
    render: (data) => (
      <FixtureStack>
        <Kbd>{data.items[0]}</Kbd>
        <Kbd>{data.items[1]}</Kbd>
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => <Kbd>{data.longLabel}</Kbd>,
  },
];
