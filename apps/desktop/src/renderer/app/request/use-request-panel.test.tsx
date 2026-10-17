// @vitest-environment jsdom
import type { RequestResult } from "@runyard/protocol";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { sampleTab } from "../sample-tab.ts";
import { useRequestPanel } from "./use-request-panel.ts";

afterEach(cleanup);

describe("请求面板的状态", () => {
  it("[DESKTOP-REQUEST-PANEL-05] 同一拍里连发两次（界面还没来得及把按钮变灰）：只发出一个请求", async () => {
    const sent: unknown[] = [];
    let release: (value: RequestResult) => void = () => {};
    const bridge = {
      call: vi.fn(async (method: string, param?: unknown) => {
        if (method === "request.getLast") return null;
        if (method === "request.send") {
          sent.push(param);
          return new Promise<RequestResult>((resolve) => {
            release = resolve;
          });
        }
        return undefined;
      }),
    } as unknown as DesktopBridge;
    const { result } = renderHook(() => useRequestPanel(bridge, sampleTab({ service: true })));
    await act(async () => {
      result.current.send();
      result.current.send();
    });
    expect(sent).toHaveLength(1);
    await act(async () => release({ outcome: "failed", reason: "unreachable", durationMs: 1 }));
    expect(result.current.sending).toBe(false);
    await act(async () => result.current.send());
    expect(sent).toHaveLength(2);
  });
});
