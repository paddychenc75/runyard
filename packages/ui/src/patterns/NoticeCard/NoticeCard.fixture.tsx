import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button } from "../../primitives/Button/index.ts";
import { NoticeCard } from "./NoticeCard.tsx";
export const meta: FixtureMeta = {
  name: "NoticeCard",
  layer: "pattern",
  boards: ["Notify", "NotifyDark", "AgentActivity"],
  backdrop: "colorful",
};
export const samples: readonly FixtureSample[] = [
  ...(["accent", "warning", "violet", "danger"] as const).map((tone) => ({
    name: tone,
    render: (data: Parameters<FixtureSample["render"]>[0]) => (
      <NoticeCard
        tone={tone}
        title={data.label}
        description={data.items[0]}
        dismissLabel={data.iconLabel}
        onDismiss={() => {}}
        actions={
          <>
            <Button variant="primary">{data.items[1]}</Button>
            <Button>{data.items[2]}</Button>
          </>
        }
      />
    ),
  })),
  {
    name: "long-label",
    render: (data) => (
      <NoticeCard
        title={data.longLabel}
        description={data.longLabel}
        dismissLabel={data.iconLabel}
        onDismiss={() => {}}
      />
    ),
  },
];
