import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { SegmentedControl } from "./SegmentedControl.tsx";

export const meta: FixtureMeta = {
  name: "SegmentedControl",
  layer: "primitive",
  boards: ["CreateDialogOn"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "selected",
    render: (data) => (
      <SegmentedControl
        label={data.label}
        value="b"
        onValueChange={() => undefined}
        items={[
          { value: "a", label: data.items[0] },
          { value: "b", label: data.items[1] },
          { value: "c", label: data.items[2] },
          { value: "d", label: data.items[3] },
        ]}
      />
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <SegmentedControl
        label={data.label}
        value="a"
        onValueChange={() => undefined}
        items={[
          { value: "a", label: data.longLabel },
          { value: "b", label: data.items[1] },
        ]}
      />
    ),
  },
];
