import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import type { OverlayCounter } from "../shared/overlay-counter.ts";

// 浮层盖住预览时：先截一帧显示在占位处，等这一帧画出来了再隐藏原生视图（先藏再画会闪一下底色），
// 浮层都关了就换回视图、再去掉截图（技术设计 §6.1）。返回要显示在占位处的那一帧，没有就是 null。

const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

// 截图最多等这么久：卡住（窗口被遮住时可能发生）就先藏视图，不让浮层一直被盖着
const CAPTURE_LIMIT_MS = 400;

async function captureWithin(bridge: DesktopBridge, limitMs: number): Promise<string | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), limitMs));
  try {
    return await Promise.race([bridge.call("preview.capture"), timeout]);
  } catch {
    return null;
  }
}

export function usePreviewSuspension(
  bridge: DesktopBridge,
  overlays: OverlayCounter,
  slot: Bounds | null,
): string | null {
  const [frame, setFrame] = useState<string | null>(null);
  // 连续开关浮层时，较早一轮的“去掉截图”不能抹掉后一轮刚截的帧
  const round = useRef(0);
  const [covered, setCovered] = useState(() => overlays.covers(slot));
  useEffect(() => {
    const update = () => setCovered(overlays.covers(slot));
    update();
    return overlays.subscribe(update);
  }, [overlays, slot]);
  useEffect(() => {
    if (!covered) return;
    const mine = ++round.current;
    let cancelled = false;
    void (async () => {
      const shot = await captureWithin(bridge, CAPTURE_LIMIT_MS);
      if (cancelled) return;
      // 没截到（预览还没就绪、窗口藏着、截图卡住）也要把视图藏起来：
      // 视图是原生的，晚一点才就绪时会盖在浮层上（#302）。没有帧就只显示占位内容
      if (shot !== null) {
        setFrame(shot);
        await nextPaint();
        if (cancelled) return;
      }
      await bridge.call("preview.visible", false);
    })();
    return () => {
      cancelled = true;
      // 浮层关了：先把视图换回来，再去掉截图
      void bridge
        .call("preview.visible", true)
        .then(nextPaint)
        .then(() => {
          if (round.current === mine) setFrame(null);
        });
    };
  }, [bridge, covered]);
  return frame;
}
