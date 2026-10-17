import type { Localized } from "@runyard/i18n";
import { FixtureFrame } from "../../fixtures/FixtureFrame.tsx";
import type { FixtureMeta, FixtureSample } from "../../fixtures/fixture-types.ts";
import styles from "./SlidingIndicator.fixture.module.css";
import { SlidingIndicator } from "./SlidingIndicator.tsx";
import { useSlidingIndicator } from "./use-sliding-indicator.ts";

export const meta: FixtureMeta = {
  name: "SlidingIndicator",
  layer: "primitive",
  boards: ["SpecMotion", "SpecControls"],
};

function Demo({ labels, selected }: { labels: readonly Localized[]; selected: number }) {
  const slide = useSlidingIndicator<HTMLDivElement>(String(selected));
  return (
    <div ref={slide.container} className={styles.root}>
      <SlidingIndicator indicatorRef={slide.indicator} className={styles.indicator} />
      {labels.map((label, index) => (
        <span
          key={label}
          className={styles.item}
          data-selected={index === selected ? "" : undefined}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export const samples: readonly FixtureSample[] = [
  {
    name: "first-selected",
    render: (data) => (
      <FixtureFrame>
        <Demo labels={data.items} selected={0} />
      </FixtureFrame>
    ),
  },
  {
    name: "last-selected",
    render: (data) => (
      <FixtureFrame>
        <Demo labels={data.items} selected={3} />
      </FixtureFrame>
    ),
  },
];
