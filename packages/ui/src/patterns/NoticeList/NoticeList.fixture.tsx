import { FixtureStage } from "../../fixtures/FixtureStage.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../../primitives/Button/index.ts";
import { NoticeList } from "./NoticeList.tsx";
export const meta: FixtureMeta = {
  name: "NoticeList",
  layer: "pattern",
  boards: ["NotifyCenter", "NotifyCenterDark"],
  backdrop: "colorful",
};
export const samples: readonly FixtureSample[] = [
  {
    name: "empty",
    render: (data) => (
      <FixtureStage>
        {(container) => (
          <NoticeList
            open
            onOpenChange={() => {}}
            trigger={<Button>{data.label}</Button>}
            title={data.label}
            clearLabel={data.items[0]}
            requiredLabel={data.items[1]}
            recentLabel={data.items[2]}
            emptyLabel={data.items[3]}
            required={null}
            recent={null}
            hasRecent={false}
            onClear={() => {}}
            container={container}
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
          <NoticeList
            open
            onOpenChange={() => {}}
            trigger={<Button>{data.label}</Button>}
            title={data.label}
            clearLabel={data.items[0]}
            requiredLabel={data.items[1]}
            recentLabel={data.items[2]}
            emptyLabel={data.items[3]}
            required={<p>{data.longLabel}</p>}
            recent={<p>{data.longLabel}</p>}
            hasRecent
            onClear={() => {}}
            container={container}
          />
        )}
      </FixtureStage>
    ),
  },
];
