import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { NavList, type NavListSection } from "./NavList.tsx";

export const meta: FixtureMeta = {
  name: "NavList",
  layer: "pattern",
  boards: ["Main", "MainDark", "MainNarrow"],
};

function sections(data: SampleData): NavListSection[] {
  const [first, second, third, fourth] = data.items;
  return [
    {
      id: "filters",
      title: data.label,
      items: [
        { id: "a", label: first, count: data.items[0] },
        { id: "b", label: second, count: data.items[1] },
        { id: "c", label: third },
      ],
    },
    {
      id: "pages",
      title: data.label,
      items: [
        { id: "d", label: fourth, icon: "grid", count: data.items[3] },
        { id: "e", label: first, icon: "cube" },
        { id: "f", label: second, icon: "clock" },
        { id: "g", label: third, icon: "sliders", disabled: true },
      ],
    },
  ];
}

export const samples: readonly FixtureSample[] = [
  {
    name: "inactive",
    render: (data) => (
      <FixtureFrame>
        <NavList label={data.label} sections={sections(data)} value="e" active={false} />
      </FixtureFrame>
    ),
  },
  {
    name: "default",
    render: (data) => (
      <FixtureFrame>
        <NavList label={data.label} sections={sections(data)} value="a" />
      </FixtureFrame>
    ),
  },
  {
    name: "icon-selected",
    render: (data) => (
      <FixtureFrame>
        <NavList label={data.label} sections={sections(data)} value="e" />
      </FixtureFrame>
    ),
  },
  {
    name: "no-selection",
    render: (data) => (
      <FixtureFrame>
        <NavList label={data.label} sections={sections(data)} />
      </FixtureFrame>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureFrame>
        <NavList
          label={data.label}
          value="a"
          sections={[
            {
              id: "long",
              items: [
                { id: "a", label: data.longLabel, count: data.items[0] },
                { id: "b", label: data.longLabel, icon: "grid" },
              ],
            },
          ]}
        />
      </FixtureFrame>
    ),
  },
];
