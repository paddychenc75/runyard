import { FixtureStage } from "../../fixtures/FixtureStage.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../Button/index.ts";
import { AlertDialog } from "./AlertDialog.tsx";

export const meta: FixtureMeta = {
  name: "AlertDialog",
  layer: "primitive",
  boards: ["CloseConfirm", "SpecMaterial"],
  backdrop: "colorful",
};

const noop = () => undefined;

export const samples: readonly FixtureSample[] = [
  {
    name: "open",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <AlertDialog
            open
            onOpenChange={noop}
            container={container}
            title={data.label}
            description={data.longLabel}
            actions={<Button variant="primary">{data.items[0]}</Button>}
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
          <AlertDialog
            open
            onOpenChange={noop}
            container={container}
            title={data.longLabel}
            description={data.longLabel}
            actions={<Button variant="primary">{data.items[0]}</Button>}
          />
        )}
      </FixtureStage>
    ),
  },
];
