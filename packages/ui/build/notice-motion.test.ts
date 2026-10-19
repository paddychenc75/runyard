import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("[DESKTOP-NOTIFICATIONS-12] 减弱动态覆盖进出两种动画，覆盖块里没有位移或缩放", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../src/patterns/NoticeCard/NoticeCard.module.css"),
    "utf8",
  );
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join("\n");
  expect(reduced).toContain("@keyframes enter");
  expect(reduced).toContain("@keyframes leave");
  expect(reduced).toContain("opacity: 0");
  expect(reduced).toContain("opacity: 1");
  expect(reduced).not.toMatch(/transform|translate|scale/);
});
