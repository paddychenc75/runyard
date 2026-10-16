import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { StepList } from "./StepList.tsx";

export const meta: FixtureMeta = {
  name: "StepList",
  layer: "primitive",
  boards: ["StartFailed", "StartFailedDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "failed-at-second",
    render: (data) => (
      <StepList
        label={data.label}
        steps={[
          { id: "a", label: data.items[0], status: "done" },
          { id: "b", label: data.items[1], status: "failed" },
          { id: "c", label: data.items[2], status: "pending" },
          { id: "d", label: data.items[3], status: "pending" },
        ]}
      />
    ),
  },
  {
    name: "in-progress",
    render: (data) => (
      <StepList
        label={data.label}
        steps={[
          { id: "a", label: data.items[0], status: "done" },
          { id: "b", label: data.items[1], status: "current" },
          { id: "c", label: data.items[2], status: "pending" },
        ]}
      />
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <StepList
        label={data.label}
        steps={[
          { id: "a", label: data.longLabel, status: "done" },
          { id: "b", label: data.longLabel, status: "failed" },
        ]}
      />
    ),
  },
];
