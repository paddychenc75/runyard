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
        <MonogramTile letters="Re" size="xl" />
      </FixtureStack>
    ),
  },
  {
    name: "logos",
    render: () => (
      <FixtureStack>
        <MonogramTile letters="HT" logo="html5" />
        <MonogramTile letters="Vu" logo="vue" />
        <MonogramTile letters="Py" logo="python" />
        <MonogramTile letters="HT" logo="html5" size="lg" />
        <MonogramTile letters="Vu" logo="vue" size="lg" />
        <MonogramTile letters="Py" logo="python" size="lg" />
        <MonogramTile letters="HT" logo="html5" size="xl" />
        <MonogramTile letters="Vu" logo="vue" size="xl" />
        <MonogramTile letters="Py" logo="python" size="xl" />
      </FixtureStack>
    ),
  },
];
