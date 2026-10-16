import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { IconButton, type IconButtonSize, type IconButtonVariant } from "./IconButton.tsx";

export const meta: FixtureMeta = {
  name: "IconButton",
  layer: "primitive",
  boards: ["SpecControls", "SpecStates", "Main"],
};

const variants: readonly IconButtonVariant[] = ["ghost", "neutral"];
const sizes: readonly IconButtonSize[] = ["xs", "sm", "md"];

const states = [
  { name: "default" },
  { name: "hover", forced: "hover" },
  { name: "pressed", forced: "pressed" },
  { name: "focus", forced: "focus" },
  { name: "disabled", disabled: true },
] as const;

export const samples: readonly FixtureSample[] = [
  ...variants.map(
    (variant): FixtureSample => ({
      name: `${variant}-states`,
      render: (data) => (
        <FixtureStack>
          {states.map((state) => (
            <IconButton
              key={state.name}
              icon="close"
              label={data.iconLabel}
              variant={variant}
              disabled={"disabled" in state}
              data-force-state={"forced" in state ? state.forced : undefined}
            />
          ))}
        </FixtureStack>
      ),
    }),
  ),
  {
    name: "sizes",
    render: (data) => (
      <FixtureStack>
        {sizes.map((size) => (
          <IconButton key={size} icon="close" label={data.iconLabel} size={size} />
        ))}
      </FixtureStack>
    ),
  },
];
