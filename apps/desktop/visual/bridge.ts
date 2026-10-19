import type { DesktopBridge } from "../src/shared/desktop-bridge.ts";
import type { LibraryState } from "../src/shared/library-state.ts";
import { bridgeAnswers } from "./bridge-data.ts";

/** 只在测试入口提供契约替身；未登记的方法必须失败，避免静默掩盖场景缺失。 */
export function sceneBridge(state: LibraryState): DesktopBridge {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const answers: Record<string, unknown> = bridgeAnswers(state);
  const unsupported: string[] = [];
  Object.defineProperty(window, "sceneDiagnostics", { value: unsupported });
  const bridge = {
    bootstrap: {
      platform: "darwin",
      windowControls: { side: "left", inset: 78 },
      modKey: "meta",
      locale: state.locale,
      theme: "light",
      reducedTransparency: false,
      highContrast: false,
    },
    async call(method: string) {
      if (method in answers) return answers[method];
      if (
        [
          "preview.bounds",
          "preview.visible",
          "preview.overlays",
          "notice.dismiss",
          "clean.shown",
          "files.watch",
          "files.unwatch",
        ].includes(method)
      )
        return;
      unsupported.push(method);
      throw new Error(`画面替身未登记桥方法：${method}`);
    },
    on(event: string, listener: (value: unknown) => void) {
      const group = listeners.get(event) ?? new Set();
      group.add(listener);
      listeners.set(event, group);
      return () => {
        group.delete(listener);
      };
    },
  };
  Object.defineProperty(window, "sceneEvents", {
    value: (event: string, payload?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  });
  return bridge as DesktopBridge;
}
