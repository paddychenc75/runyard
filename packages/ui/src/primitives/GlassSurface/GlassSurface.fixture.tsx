import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { type GlassMaterial, GlassSurface } from "./GlassSurface.tsx";

export const meta: FixtureMeta = {
  name: "GlassSurface",
  layer: "primitive",
  boards: ["SpecMaterial"],
  backdrop: "colorful",
};

const materials: readonly GlassMaterial[] = ["toolbar", "sidebar", "filetree", "dialog", "menu"];

export const samples: readonly FixtureSample[] = [
  ...materials.map(
    (material): FixtureSample => ({
      name: material,
      render: (data) => (
        <GlassSurface material={material}>
          <FixtureBox>{data.label}</FixtureBox>
        </GlassSurface>
      ),
    }),
  ),
  {
    name: "all-materials",
    render: (data) => (
      <FixtureStack>
        {materials.map((material) => (
          <GlassSurface key={material} material={material}>
            <FixtureBox>{data.label}</FixtureBox>
          </GlassSurface>
        ))}
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack direction="column">
        {materials.map((material) => (
          <GlassSurface key={material} material={material}>
            <FixtureBox>{data.longLabel}</FixtureBox>
          </GlassSurface>
        ))}
      </FixtureStack>
    ),
  },
];
