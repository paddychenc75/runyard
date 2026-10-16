// 由 pnpm icons:build 生成，不要手改。来源：src/icons/svg/*.svg（技术设计 §6.7）。

export const iconPaths = {
  check: {
    viewBox: "0 0 16 16",
    paths: ["M3.5 8.5l3 3 6-7"],
  },
  plus: {
    viewBox: "0 0 16 16",
    paths: ["M8 3.25v9.5M3.25 8h9.5"],
  },
  spinner: {
    viewBox: "0 0 16 16",
    paths: ["M8 2.25a5.75 5.75 0 1 0 5.75 5.75"],
  },
} as const;

export type IconName = keyof typeof iconPaths;
