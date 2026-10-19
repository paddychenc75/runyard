import { numbers } from "@runyard/tokens";
import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

/** 页面可立即显示，图标独立转完一圈；旧预览的回调不能结束新预览的动效。 */
export function usePreviewRefresh(bridge: DesktopBridge, id: string, url: string | null) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const current = useRef({ active: false, disposed: false, started: 0 });
  useEffect(() => {
    const scope = { active: false, disposed: false, started: 0 };
    current.current = scope;
    setRefreshing(false);
    setLoading(false);
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      if (media?.matches && !scope.active) setRefreshing(false);
    };
    media?.addEventListener("change", onMotionChange);
    return () => {
      scope.disposed = true;
      media?.removeEventListener("change", onMotionChange);
    };
  }, [id, url]);
  const reload = () => {
    const scope = current.current;
    if (url === null || scope.active) return;
    scope.active = true;
    scope.started = performance.now();
    setRefreshing(true);
    setLoading(true);
    const finish = () => {
      if (current.current !== scope || scope.disposed) return;
      scope.active = false;
      setLoading(false);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setRefreshing(false);
    };
    // 原生加载失败或桥断开同样结束等待，避免产生未处理的拒绝。
    void bridge.call("preview.reload", id).then(finish, finish);
  };
  const onAnimationIteration = () => {
    const scope = current.current;
    // 等 CSS 真正完成一圈，不用点击时钟的计时器抢在首个绘制帧之前结束。
    // 连续点击发生在同一圈中途时，当前边界不足一圈就继续到下一边界。
    if (!scope.active && performance.now() - scope.started >= numbers["motion-duration-spin"]) {
      setRefreshing(false);
    }
  };
  return { refreshing, loading, reload, onAnimationIteration };
}
