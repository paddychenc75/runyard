import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { StatusMark } from "./StatusMark.tsx";

export const meta: FixtureMeta = {
  name: "StatusMark",
  layer: "primitive",
  boards: ["Main", "MainDark", "SpecStates"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "error-sizes",
    render: (data) => (
      <FixtureStack>
        <StatusMark status="crashed" markLabel={data.label} />
        <StatusMark status="crashed" size="step" markLabel={data.label} />
        <StatusMark status="crashed" size="hero" markLabel={data.label} />
      </FixtureStack>
    ),
  },
  {
    name: "all-statuses",
    render: (data) => (
      <FixtureStack>
        <StatusMark status="running">{data.items[0]}</StatusMark>
        <StatusMark status="starting">{data.items[1]}</StatusMark>
        <StatusMark status="stopped">{data.items[2]}</StatusMark>
        <StatusMark status="crashed">{data.items[3]}</StatusMark>
      </FixtureStack>
    ),
  },
  {
    name: "mark-only",
    render: (data) => (
      <FixtureStack>
        <StatusMark status="running" markLabel={data.label} />
        <StatusMark status="stopped" markLabel={data.label} />
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => <StatusMark status="running">{data.longLabel}</StatusMark>,
  },
];
