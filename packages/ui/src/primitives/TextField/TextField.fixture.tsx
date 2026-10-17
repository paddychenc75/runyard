import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Field } from "../Field/index.ts";
import { TextField } from "./TextField.tsx";

export const meta: FixtureMeta = {
  name: "TextField",
  layer: "primitive",
  boards: ["CreateDialog", "CreateDialogOn"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "states",
    render: (data) => (
      <FixtureStack direction="column">
        <Field label={data.label}>
          <TextField aria-label={data.label} placeholder={data.items[0]} />
        </Field>
        <Field label={data.label}>
          <TextField aria-label={data.label} defaultValue={data.userText} />
        </Field>
        <Field label={data.label}>
          <TextField
            aria-label={data.label}
            data-force-state="focus"
            defaultValue={data.userText}
          />
        </Field>
        <Field label={data.label}>
          <TextField aria-label={data.label} disabled defaultValue={data.userText} />
        </Field>
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack direction="column">
        <Field label={data.label}>
          <TextField aria-label={data.label} defaultValue={data.longLabel} />
        </Field>
      </FixtureStack>
    ),
  },
];
