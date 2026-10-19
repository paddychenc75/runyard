import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Toast } from "./Toast.tsx";
export const meta: FixtureMeta = {
  name: "Toast",
  layer: "primitive",
  boards: ["Notify", "NotifyDark"],
  backdrop: "colorful",
};
export const samples: readonly FixtureSample[] = [
  { name: "success", render: (data) => <Toast message={data.label} onDismiss={() => {}} /> },
  { name: "long-label", render: (data) => <Toast message={data.longLabel} onDismiss={() => {}} /> },
];
