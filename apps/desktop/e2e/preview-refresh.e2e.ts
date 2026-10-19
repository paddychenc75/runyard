import { numbers } from "@runyard/tokens";
import {
  holdPreviewRequest,
  incrementPreview,
  openRefreshFixture,
  releasePreviewRequest,
} from "./preview-refresh-fixture.ts";
import { attachScreenshot, expect, previewText, test } from "./support/fixtures.ts";

test("[DESKTOP-WORKSPACE-71] 快速刷新保留一圈动效并真正重置预览里的计数", async ({ launch }) => {
  const instance = await launch();
  await openRefreshFixture(instance);
  await incrementPreview(instance);
  const reload = instance.page.getByRole("button", { name: "Reload", exact: true });
  // 用事件观察器抓快速加载的短暂状态，避免轮询错过动效开始。
  await reload.evaluate((button) => {
    const record = { starts: 0, loops: 0, began: 0, ended: 0, expected: 0, elapsed: 0 };
    (window as unknown as { refreshMotion: typeof record }).refreshMotion = record;
    new MutationObserver(() => {
      if (button.getAttribute("data-refreshing") === "true" && record.began === 0) {
        record.began = performance.now();
        const svg = button.querySelector("svg");
        if (svg)
          record.expected = Number.parseFloat(getComputedStyle(svg).animationDuration) * 1000;
      } else if (button.getAttribute("data-refreshing") !== "true" && record.began > 0) {
        record.ended = performance.now();
      }
    }).observe(button, { attributes: true, attributeFilter: ["data-refreshing"] });
    button.addEventListener("animationiteration", (event) => {
      if (event.target !== button.querySelector("svg")) return;
      record.loops++;
      record.elapsed = (event as AnimationEvent).elapsedTime * 1000;
    });
    button.addEventListener("animationstart", (event) => {
      if (event.target !== button.querySelector("svg")) return;
      record.starts++;
    });
  });
  await reload.click();
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 0 times");
  await expect
    .poll(() =>
      instance.page.evaluate(
        () => (window as unknown as { refreshMotion: { starts: number } }).refreshMotion.starts,
      ),
    )
    .toBeGreaterThan(0);
  await expect(reload).not.toHaveAttribute("data-refreshing", "true");
  await expect(reload).toBeEnabled();
  const motion = await instance.page.evaluate(
    () =>
      (
        window as unknown as {
          refreshMotion: {
            loops: number;
            began: number;
            ended: number;
            expected: number;
            elapsed: number;
          };
        }
      ).refreshMotion,
  );
  console.log(
    "刷新动效观测",
    JSON.stringify({ ...motion, observedMs: motion.ended - motion.began }),
  );
  expect(motion.loops).toBeGreaterThanOrEqual(1);
  expect(motion.expected).toBe(numbers["motion-duration-spin"]);
  expect(motion.ended).toBeGreaterThan(motion.began);
  // #515：DOM 观察回调不与 CSS 动画时钟同源；用同一动画已完成的时间，周期门槛不变。
  expect(motion.elapsed).toBeGreaterThanOrEqual(motion.expected);
});

test("[DESKTOP-WORKSPACE-71] 慢加载持续旋转，网络失败恢复可点击，减少动态时保持静止", async ({
  launch,
}, info) => {
  const instance = await launch();
  await openRefreshFixture(instance);
  const reload = instance.page.getByRole("button", { name: "Reload", exact: true });
  await holdPreviewRequest(instance);
  await reload.click();
  await expect(reload).toHaveAttribute("data-refreshing", "true");
  const icon = reload.locator('[data-icon="refresh"]');
  await expect
    .poll(() => icon.evaluate((svg) => getComputedStyle(svg).animationName))
    .not.toBe("none");
  // 真实请求被挂起；等动画跨过一轮仍忙碌，证明最短一圈结束不会抢先清除加载状态。
  await expect
    .poll(() =>
      icon.evaluate((svg) =>
        svg
          .getAnimations()
          .some(
            (animation) =>
              Number(animation.currentTime) >= Number(animation.effect?.getTiming().duration),
          ),
      ),
    )
    .toBe(true);
  await expect(reload).toHaveAttribute("aria-busy", "true");
  await attachScreenshot(instance.page, info, "preview-refresh-loading");
  await releasePreviewRequest(instance);
  await expect(reload).not.toHaveAttribute("data-refreshing", "true");
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 0 times");
  await instance.page.emulateMedia({ reducedMotion: "reduce" });
  await holdPreviewRequest(instance);
  await reload.click();
  await expect(reload).toHaveAttribute("aria-busy", "true");
  await expect(icon).toHaveCSS("animation-name", "none");
  await releasePreviewRequest(instance, true);
  await expect(reload).not.toHaveAttribute("data-refreshing", "true");
  await expect(reload).toBeEnabled();
});
