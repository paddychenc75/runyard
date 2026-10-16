import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { type IconName, iconPaths } from "../../icons/generated/icon-paths.ts";
import { Icon } from "./Icon.tsx";

export const meta: FixtureMeta = {
  name: "Icon",
  layer: "primitive",
  boards: ["SpecType"],
};

const names = Object.keys(iconPaths) as IconName[];

export const samples: readonly FixtureSample[] = [
  {
    name: "all-icons",
    render: () => (
      <FixtureStack>
        {names.map((name) => (
          <Icon key={name} name={name} />
        ))}
      </FixtureStack>
    ),
  },
  {
    name: "sizes",
    render: () => (
      <FixtureStack>
        <Icon name="plus" size={12} />
        <Icon name="plus" size={14} />
        <Icon name="plus" size={16} />
        <Icon name="plus" size={24} />
      </FixtureStack>
    ),
  },
  {
    name: "with-label",
    render: (data) => <Icon name="check" label={data.iconLabel} />,
  },
];
