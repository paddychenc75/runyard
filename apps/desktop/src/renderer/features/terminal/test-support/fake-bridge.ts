import { vi } from "vitest";
import type { DesktopBridge } from "../../../../shared/desktop-bridge.ts";
import type {
  TerminalDataEvent,
  TerminalSnapshot,
  TerminalStateEvent,
} from "../../../../shared/terminal.ts";

// 终端测试用的假桥（只在 *.test.ts(x) 里导入）：记下所有 call，按名字回话，事件由测试推。
export function fakeBridge(
  replies: Record<string, unknown> = {},
  modKey: "meta" | "ctrl" = "meta",
) {
  const calls: { method: string; param: unknown }[] = [];
  const listeners = new Map<string, ((payload: never) => void)[]>();
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push({ method, param });
    const reply = replies[method];
    return typeof reply === "function" ? (reply as (p: unknown) => unknown)(param) : reply;
  });
  const bridge = {
    bootstrap: {
      platform: "darwin",
      windowControls: { side: "left", inset: 72 },
      modKey,
      locale: "zh-CN",
      theme: "light",
      reducedTransparency: false,
      highContrast: false,
    },
    call,
    on: (name: string, listener: (payload: never) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return () =>
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((l) => l !== listener),
        );
    },
  } as unknown as DesktopBridge;
  return {
    bridge,
    call,
    calls,
    named: (method: string) => calls.filter((c) => c.method === method).map((c) => c.param),
    emit: (name: string, payload: unknown) => {
      for (const listener of listeners.get(name) ?? []) (listener as (p: unknown) => void)(payload);
    },
    emitData: (event: TerminalDataEvent) => {
      for (const listener of listeners.get("terminal.data") ?? [])
        (listener as (p: unknown) => void)(event);
    },
    emitState: (event: TerminalStateEvent) => {
      for (const listener of listeners.get("terminal.state") ?? [])
        (listener as (p: unknown) => void)(event);
    },
  };
}

export function runningSnapshot(output = ""): TerminalSnapshot {
  return { state: { kind: "running", pid: 1, shell: "/bin/zsh" }, output };
}
