import type { Page } from "@playwright/test";

export interface UiSample {
  domMs: number;
  paintedMs: number;
  observed: string[];
  longTasks: { start: number; duration: number }[];
}

/** 只在测量页面监听真实输入与DOM，不改产品状态、注册表或时钟。 */
export async function armUiProbe(
  page: Page,
  options: {
    key: string;
    selector: string;
    needle: string;
    query?: string;
    count?: number;
    traceLabel?: string;
  },
) {
  await page.evaluate((options) => {
    const holder = window as unknown as { performanceSample: Promise<unknown> };
    holder.performanceSample = new Promise((resolve) => {
      let began: number | undefined;
      let finished = false;
      const states: unknown[] = [];
      const frames: { stamp: number; callback: number; visibility: string; focused: boolean }[] =
        [];
      const snapshot = () => ({
        at: performance.now(),
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      });
      const longTasks: { start: number; duration: number }[] = [];
      const tasks = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          longTasks.push({ start: entry.startTime, duration: entry.duration });
      });
      tasks.observe({ type: "longtask" });
      const mark = (phase: string) => {
        if (options.traceLabel) performance.mark(`${options.traceLabel}:${phase}`);
      };
      const eventName = options.key === "pointerdown" ? "pointerdown" : "keydown";
      const start = (event: Event) => {
        if (
          eventName === "keydown" &&
          (event as KeyboardEvent).key.toLowerCase() !== options.key.toLowerCase()
        )
          return;
        began = performance.now();
        mark("input");
        states.push({ phase: "input", ...snapshot() });
        window.removeEventListener(eventName, start, true);
      };
      window.addEventListener(eventName, start, true);
      const observer = new MutationObserver(() => {
        if (began === undefined || finished) return;
        const nodes = [...document.querySelectorAll(options.selector)];
        const observed = nodes.map((node) => (node.textContent ?? "").replaceAll("\u00a0", " "));
        if (options.count !== undefined && observed.length !== options.count) return;
        if (!observed.some((text) => text.includes(options.needle))) return;
        if (
          options.query !== undefined &&
          document.querySelector<HTMLInputElement>('[role="dialog"] [role="combobox"]')?.value !==
            options.query
        )
          return;
        finished = true;
        const domMs = performance.now() - began;
        mark("dom");
        states.push({ phase: "dom", ...snapshot() });
        observer.disconnect();
        requestAnimationFrame((stamp) => {
          frames.push({
            stamp,
            callback: performance.now(),
            visibility: document.visibilityState,
            focused: document.hasFocus(),
          });
          mark("raf1");
          requestAnimationFrame((stamp) => {
            frames.push({
              stamp,
              callback: performance.now(),
              visibility: document.visibilityState,
              focused: document.hasFocus(),
            });
            const paintedMs = performance.now() - (began ?? 0);
            mark("raf2");
            states.push({ phase: "frames", ...snapshot() });
            for (const entry of tasks.takeRecords())
              longTasks.push({ start: entry.startTime, duration: entry.duration });
            tasks.disconnect();
            const animations = document.getAnimations().map((animation) => ({
              playState: animation.playState,
              currentTime: animation.currentTime,
              animationName: animation instanceof CSSAnimation ? animation.animationName : null,
              transitionProperty:
                animation instanceof CSSTransition ? animation.transitionProperty : null,
              targetTag:
                animation.effect instanceof KeyframeEffect
                  ? animation.effect.target?.tagName
                  : null,
              targetClass:
                animation.effect instanceof KeyframeEffect
                  ? animation.effect.target?.getAttribute("class")
                  : null,
            }));
            resolve({ domMs, paintedMs, observed, longTasks, states, frames, animations });
          });
        });
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
  }, options);
}

export async function readUiProbe(page: Page): Promise<UiSample> {
  return page.evaluate(
    () => (window as unknown as { performanceSample: Promise<UiSample> }).performanceSample,
  );
}
