import { FixtureStage } from "../../fixtures/FixtureStage.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

export const meta: FixtureMeta = {
  name: "ConfirmDialog",
  layer: "pattern",
  boards: ["CloseConfirm"],
  backdrop: "colorful",
};

const noop = () => undefined;

export const samples: readonly FixtureSample[] = [
  {
    name: "with-opt-out",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <ConfirmDialog
            open
            container={container}
            title={data.label}
            description={data.longLabel}
            icon="stop"
            cancelLabel={data.items[0]}
            confirmLabel={data.items[1]}
            optOut={{ label: data.items[2], hint: data.longLabel }}
            onConfirm={noop}
            onCancel={noop}
          />
        )}
      </FixtureStage>
    ),
  },
  {
    name: "plain",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <ConfirmDialog
            open
            container={container}
            title={data.label}
            description={data.label}
            icon="stop"
            cancelLabel={data.items[0]}
            confirmLabel={data.items[1]}
            onConfirm={noop}
            onCancel={noop}
          />
        )}
      </FixtureStage>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <ConfirmDialog
            open
            container={container}
            title={data.longLabel}
            description={data.longLabel}
            icon="stop"
            cancelLabel={data.items[0]}
            confirmLabel={data.items[1]}
            optOut={{ label: data.longLabel, hint: data.longLabel }}
            onConfirm={noop}
            onCancel={noop}
          />
        )}
      </FixtureStage>
    ),
  },
];
