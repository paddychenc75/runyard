// 由 pnpm icons:build 生成，不要手改。来源：src/icons/svg/*.svg（技术设计 §6.7）。

export const iconPaths = {
  check: {
    viewBox: "0 0 16 16",
    paths: ["M3.5 8.5l3 3 6-7"],
  },
  clock: {
    viewBox: "0 0 16 16",
    paths: ["M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 4.5V8l2.5 1.5"],
  },
  close: {
    viewBox: "0 0 16 16",
    paths: ["M4 4l8 8M12 4l-8 8"],
  },
  cube: {
    viewBox: "0 0 16 16",
    paths: ["M8 1.5L14 5v6l-6 3.5L2 11V5zM2 5l6 3.5L14 5M8 8.5v6"],
  },
  grid: {
    viewBox: "0 0 16 16",
    paths: [
      "M3.2 2h2.6A1.2 1.2 0 0 1 7 3.2v2.6A1.2 1.2 0 0 1 5.8 7H3.2A1.2 1.2 0 0 1 2 5.8V3.2A1.2 1.2 0 0 1 3.2 2zM10.2 2h2.6A1.2 1.2 0 0 1 14 3.2v2.6A1.2 1.2 0 0 1 12.8 7h-2.6A1.2 1.2 0 0 1 9 5.8V3.2A1.2 1.2 0 0 1 10.2 2zM3.2 9h2.6A1.2 1.2 0 0 1 7 10.2v2.6A1.2 1.2 0 0 1 5.8 14H3.2A1.2 1.2 0 0 1 2 12.8v-2.6A1.2 1.2 0 0 1 3.2 9zM10.2 9h2.6a1.2 1.2 0 0 1 1.2 1.2v2.6a1.2 1.2 0 0 1-1.2 1.2h-2.6A1.2 1.2 0 0 1 9 12.8v-2.6A1.2 1.2 0 0 1 10.2 9z",
    ],
  },
  play: {
    viewBox: "0 0 16 16",
    paths: ["M5 3.5v9l7.5-4.5z"],
  },
  plus: {
    viewBox: "0 0 16 16",
    paths: ["M8 3.25v9.5M3.25 8h9.5"],
  },
  sliders: {
    viewBox: "0 0 16 16",
    paths: [
      "M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M10.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    ],
  },
  spark: {
    viewBox: "0 0 16 16",
    paths: [
      "M8 2v2.667M8 11.333V14M2 8h2.667M11.333 8H14M4 4l1.6 1.6M10.4 10.4 12 12M12 4l-1.6 1.6M5.6 10.4 4 12",
    ],
  },
  spinner: {
    viewBox: "0 0 16 16",
    paths: ["M8 2.25a5.75 5.75 0 1 0 5.75 5.75"],
  },
  stop: {
    viewBox: "0 0 16 16",
    paths: ["M4.5 4.5h7v7h-7z"],
  },
} as const;

export type IconName = keyof typeof iconPaths;
