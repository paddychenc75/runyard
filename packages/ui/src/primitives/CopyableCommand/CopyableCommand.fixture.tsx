import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { CopyableCommand } from "./CopyableCommand.tsx";

export const meta: FixtureMeta = {
  name: "CopyableCommand",
  layer: "primitive",
  boards: ["Missing", "MissingLight"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "short",
    render: (data) => <CopyableCommand label={data.label} command="brew install go" />,
  },
  {
    name: "long-command",
    render: (data) => (
      <CopyableCommand
        label={data.label}
        command="curl -fsSL https://example.test/install.sh | sh -s -- --version 1.22.0 --prefix /usr/local"
      />
    ),
  },
];
