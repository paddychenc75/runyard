import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Kbd } from "../Kbd/index.ts";
import { SearchField } from "./SearchField.tsx";

export const meta: FixtureMeta = {
  name: "SearchField",
  layer: "primitive",
  boards: ["Picker", "PickerDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "placeholder",
    render: (data) => (
      <SearchField
        label={data.label}
        placeholder={data.longLabel}
        trailing={<Kbd>{data.items[0]}</Kbd>}
      />
    ),
  },
  {
    name: "with-value",
    render: (data) => (
      <FixtureStack direction="column">
        <SearchField label={data.label} defaultValue={data.userText} />
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <SearchField
        label={data.label}
        defaultValue={data.longLabel}
        trailing={<Kbd>{data.items[0]}</Kbd>}
      />
    ),
  },
];
