import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../Button/index.ts";
import { UserText } from "../UserText/index.ts";
import { Banner } from "./Banner.tsx";

export const meta: FixtureMeta = {
  name: "Banner",
  layer: "primitive",
  boards: ["StartFailed", "StartFailedDark"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "warning-with-actions",
    render: (data) => (
      <Banner
        title={data.label}
        description={data.items[0]}
        actions={<Button variant="primary">{data.items[1]}</Button>}
      >
        <UserText>{data.userText}</UserText>
      </Banner>
    ),
  },
  {
    name: "danger",
    render: (data) => (
      <FixtureStack direction="column">
        <Banner tone="danger" icon="exclamation" title={data.label} description={data.items[0]} />
      </FixtureStack>
    ),
  },
  {
    name: "title-only",
    render: (data) => <Banner title={data.label} />,
  },
  {
    name: "long-label",
    render: (data) => <Banner title={data.longLabel} description={data.longLabel} />,
  },
];
