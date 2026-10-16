import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample, SampleData } from "../../fixtures/fixture-types.ts";
import { LogView, type LogViewLine } from "./LogView.tsx";

export const meta: FixtureMeta = {
  name: "LogView",
  layer: "pattern",
  boards: ["Service", "ServiceDark", "ScriptRunning", "ScriptFailed", "Stopped"],
};

// 样例里的输出是“用户内容”（不翻译），所以重复用示例里的用户文字，数字是时间和行号
function lines(data: SampleData): LogViewLine[] {
  return [
    { id: 1, time: "20:02:10", tone: "command", text: data.userText },
    { id: 2, time: "20:02:10", text: data.userText },
    { id: 3, time: "20:11:01", tone: "notice", text: data.userText },
    { id: 4, time: "20:11:02", tone: "error", text: data.userText },
  ];
}

export const samples: readonly FixtureSample[] = [
  {
    name: "default",
    render: (data) => (
      <FixtureFrame>
        <LogView lines={lines(data)} label={data.label} />
      </FixtureFrame>
    ),
  },
  {
    name: "no-time",
    render: (data) => (
      <FixtureFrame>
        <LogView lines={lines(data).map(({ time: _time, ...line }) => line)} label={data.label} />
      </FixtureFrame>
    ),
  },
  {
    name: "empty",
    render: (data) => (
      <FixtureFrame>
        <LogView lines={[]} label={data.label} empty={data.label} />
      </FixtureFrame>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureFrame>
        <LogView label={data.label} lines={[{ id: 1, time: "20:02:10", text: data.longLabel }]} />
      </FixtureFrame>
    ),
  },
];
