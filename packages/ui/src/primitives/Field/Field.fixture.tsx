import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { TextField } from "../TextField/index.ts";
import { Field } from "./Field.tsx";

export const meta: FixtureMeta = {
  name: "Field",
  layer: "primitive",
  boards: ["CreateDialog", "CreateDialogOn"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "states",
    render: (data) => (
      <FixtureStack direction="column">
        <Field label={data.label} description={data.items[0]}>
          <TextField
            aria-label={data.label}
            data-force-state="focus"
            defaultValue={data.userText}
          />
        </Field>
        <Field label={data.label} optionalLabel={data.items[1]}>
          <TextField aria-label={data.label} placeholder={data.items[2]} />
        </Field>
        <Field label={data.label} error={data.items[3]}>
          <TextField aria-label={data.label} defaultValue={data.userText} />
        </Field>
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack direction="column">
        <Field label={data.longLabel} optionalLabel={data.longLabel} description={data.longLabel}>
          <TextField aria-label={data.label} placeholder={data.longLabel} />
        </Field>
      </FixtureStack>
    ),
  },
];
