import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Switch } from "./Switch.tsx";

export const meta: FixtureMeta = {
  name: "Switch",
  layer: "primitive",
  boards: ["CreateDialog", "CreateDialogOn"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "states",
    render: (data) => (
      <FixtureStack>
        <Switch label={data.label} checked={false} />
        <Switch label={data.label} checked />
        <Switch label={data.label} data-force-state="focus" checked={false} />
        <Switch label={data.label} disabled checked />
      </FixtureStack>
    ),
  },
];
