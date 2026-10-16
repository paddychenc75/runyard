import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Checkbox } from "./Checkbox.tsx";

export const meta: FixtureMeta = {
  name: "Checkbox",
  layer: "primitive",
  boards: ["CloseConfirm"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "states",
    render: (data) => (
      <FixtureStack>
        <Checkbox label={data.label} hint={data.longLabel} checked={false} />
        <Checkbox label={data.label} hint={data.longLabel} checked />
        <Checkbox label={data.label} data-force-state="focus" checked={false} />
        <Checkbox label={data.label} disabled checked={false} />
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack>
        <Checkbox label={data.longLabel} hint={data.longLabel} checked={false} />
      </FixtureStack>
    ),
  },
];
