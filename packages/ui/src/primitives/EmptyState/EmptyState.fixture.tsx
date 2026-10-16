import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../Button/index.ts";
import { EmptyState } from "./EmptyState.tsx";

export const meta: FixtureMeta = {
  name: "EmptyState",
  layer: "primitive",
  boards: ["Empty", "EmptyDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "with-action",
    render: (data) => (
      <EmptyState title={data.label} description={data.items[0]}>
        <Button variant="primary" icon="plus">
          {data.items[1]}
        </Button>
      </EmptyState>
    ),
  },
  {
    name: "title-only",
    render: (data) => <EmptyState title={data.label} />,
  },
  {
    name: "long-label",
    render: (data) => <EmptyState title={data.longLabel} description={data.longLabel} />,
  },
];
