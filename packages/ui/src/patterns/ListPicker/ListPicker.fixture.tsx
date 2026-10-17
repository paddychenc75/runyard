import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { Kbd } from "../../primitives/Kbd/index.ts";
import { SearchField } from "../../primitives/SearchField/index.ts";
import { ListPicker, type ListPickerGroup } from "./ListPicker.tsx";

export const meta: FixtureMeta = {
  name: "ListPicker",
  layer: "pattern",
  boards: ["Picker", "PickerDark", "PickerEn", "PickerDarkEn"],
};

function groups(data: SampleData, long: boolean): ListPickerGroup[] {
  const [first, second, third, fourth] = data.items;
  const text = long ? data.longLabel : first;
  return [
    {
      id: "recent",
      title: first,
      items: [{ id: "a", title: text, subtitle: second, letters: "Re" }],
    },
    {
      id: "all",
      title: second,
      items: [
        { id: "b", title: third, subtitle: text, letters: "Vu" },
        { id: "c", title: fourth, subtitle: text, tone: "warning", letters: "Nu" },
        { id: "d", title: first, letters: "Go" },
      ],
    },
  ];
}

function picker(data: SampleData, long: boolean, empty = false, withRail = false) {
  return (
    <FixtureFrame>
      <ListPicker
        label={data.label}
        groups={empty ? [] : groups(data, long)}
        rail={
          withRail
            ? {
                label: data.label,
                items: [
                  { id: "recent", label: data.items[0], count: 1, groupId: "recent" },
                  { id: "all", label: data.items[1], count: 4 },
                  { id: "other", label: data.items[2], count: 3, groupId: "all" },
                ],
              }
            : undefined
        }
        chooseLabel={data.items[2]}
        onChoose={() => {}}
        renderHeader={(props) => (
          <SearchField
            {...props}
            label={data.label}
            placeholder={data.items[1]}
            trailing={<Kbd>{data.items[3]}</Kbd>}
          />
        )}
        footer={<Kbd>{data.items[0]}</Kbd>}
      />
    </FixtureFrame>
  );
}

export const samples: readonly FixtureSample[] = [
  { name: "default", render: (data) => picker(data, false) },
  { name: "empty", render: (data) => picker(data, false, true) },
  { name: "long-label", render: (data) => picker(data, true) },
  { name: "with-rail", render: (data) => picker(data, false, false, true) },
];
