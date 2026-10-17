import { FixtureStage } from "../../fixtures/FixtureStage.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../Button/index.ts";
import { Field } from "../Field/index.ts";
import { MonogramTile } from "../MonogramTile/index.ts";
import { TextField } from "../TextField/index.ts";
import { Dialog } from "./Dialog.tsx";

export const meta: FixtureMeta = {
  name: "Dialog",
  layer: "primitive",
  boards: ["CreateDialog", "CreateDialogOn"],
  backdrop: "colorful",
};

const noop = () => undefined;

export const samples: readonly FixtureSample[] = [
  {
    name: "open",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <Dialog
            open
            onOpenChange={noop}
            onSubmit={noop}
            container={container}
            title={data.label}
            subtitle={data.items[0]}
            leading={<MonogramTile letters="Re" size="xl" />}
            headerAction={<Button>{data.items[1]}</Button>}
            hint={data.items[2]}
            actions={
              <>
                <Button>{data.items[3]}</Button>
                <Button variant="primary" type="submit">
                  {data.items[0]}
                </Button>
              </>
            }
          >
            <Field label={data.label}>
              <TextField aria-label={data.label} defaultValue={data.userText} />
            </Field>
          </Dialog>
        )}
      </FixtureStage>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <Dialog
            open
            onOpenChange={noop}
            onSubmit={noop}
            container={container}
            title={data.longLabel}
            subtitle={data.longLabel}
            hint={data.longLabel}
            actions={
              <Button variant="primary" type="submit">
                {data.items[0]}
              </Button>
            }
          >
            <Field label={data.longLabel}>
              <TextField aria-label={data.label} defaultValue={data.longLabel} />
            </Field>
          </Dialog>
        )}
      </FixtureStage>
    ),
  },
];
