import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { MonogramTile } from "./MonogramTile.tsx";

export const meta: FixtureMeta = {
  name: "MonogramTile",
  layer: "primitive",
  boards: ["Main", "MainDark", "Empty"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "sizes",
    render: () => (
      <FixtureStack>
        <MonogramTile letters="Re" />
        <MonogramTile letters="TS" size="lg" />
      </FixtureStack>
    ),
  },
];
