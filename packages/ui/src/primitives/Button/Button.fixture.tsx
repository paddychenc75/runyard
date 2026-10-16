import { FixtureStack } from "../../fixtures/FixtureStack.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import { Button, type ButtonVariant } from "./Button.tsx";

export const meta: FixtureMeta = {
  name: "Button",
  layer: "primitive",
  boards: ["SpecControls", "SpecStates", "SpecMotion"],
};

const variants: readonly ButtonVariant[] = ["primary", "glass", "neutral", "destructive"];

// 规范板“按钮”一页：每个变体的 默认 / 悬停 / 按下 / 聚焦 / 禁用
const states = [
  { name: "default" },
  { name: "hover", forced: "hover" },
  { name: "pressed", forced: "pressed" },
  { name: "focus", forced: "focus" },
  { name: "disabled", disabled: true },
] as const;

const stateSamples: FixtureSample[] = variants.map((variant) => ({
  name: `${variant}-states`,
  render: (data) => (
    <FixtureStack>
      {states.map((state) => (
        <Button
          key={state.name}
          variant={variant}
          disabled={"disabled" in state}
          data-force-state={"forced" in state ? state.forced : undefined}
        >
          {data.label}
        </Button>
      ))}
    </FixtureStack>
  ),
}));

export const samples: readonly FixtureSample[] = [
  ...stateSamples,
  {
    name: "with-icon",
    render: (data) => (
      <FixtureStack>
        {variants.map((variant) => (
          <Button key={variant} variant={variant} icon="plus">
            {data.label}
          </Button>
        ))}
      </FixtureStack>
    ),
  },
  {
    name: "loading",
    render: (data) => (
      <FixtureStack>
        {variants.map((variant) => (
          <Button key={variant} variant={variant} loading>
            {data.label}
          </Button>
        ))}
      </FixtureStack>
    ),
  },
  {
    name: "sizes",
    render: (data) => (
      <FixtureStack>
        <Button variant="primary" size="lg">
          {data.label}
        </Button>
        <Button variant="primary" size="md">
          {data.label}
        </Button>
        <Button variant="primary" size="sm">
          {data.label}
        </Button>
      </FixtureStack>
    ),
  },
  {
    name: "long-label",
    render: (data) => (
      <FixtureStack direction="column">
        <Button variant="primary">{data.longLabel}</Button>
        <Button variant="neutral">{data.longLabel}</Button>
      </FixtureStack>
    ),
  },
];
