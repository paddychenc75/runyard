import { FixtureBox } from "../../fixtures/FixtureBox.tsx";
import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { ScrollArea } from "./ScrollArea.tsx";

export const meta: FixtureMeta = {
  name: "ScrollArea",
  layer: "primitive",
  boards: ["SpecControls", "MainNarrow"],
};

export const samples: readonly FixtureSample[] = [
  {
    name: "vertical",
    render: (data) => (
      <FixtureFrame>
        <ScrollArea>
          {Array.from({ length: 12 }, (_, index) => (
            // 样例的行是固定顺序，没有增删，用下标当 key 没有问题
            <FixtureBox key={index}>{data.items[index % data.items.length]}</FixtureBox>
          ))}
        </ScrollArea>
      </FixtureFrame>
    ),
  },
  {
    name: "horizontal",
    render: (data) => (
      <FixtureFrame>
        <ScrollArea orientation="horizontal">
          <FixtureBox>{data.longLabel}</FixtureBox>
        </ScrollArea>
      </FixtureFrame>
    ),
  },
  {
    name: "short-content",
    render: (data) => (
      <FixtureFrame>
        <ScrollArea>
          <FixtureBox>{data.label}</FixtureBox>
        </ScrollArea>
      </FixtureFrame>
    ),
  },
];
