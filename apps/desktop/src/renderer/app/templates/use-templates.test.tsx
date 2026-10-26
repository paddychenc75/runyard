// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { detailOf, pageRow } from "./templates-world.tsx";
import { useTemplates } from "./use-templates.ts";

afterEach(cleanup);

it("[DESKTOP-TEMPLATES-VIEW-03] [DESKTOP-TEMPLATES-VIEW-04] 检测缓存更新后刷新已选模板，不主动检测", async () => {
  const row = pageRow("go", "script");
  let version = "1.20.1";
  const listeners = new Map<string, () => void>();
  const call = vi.fn(async (method: string) =>
    method === "template.list"
      ? [row]
      : detailOf(row, {
          tools: [
            {
              tool: "go",
              required: ">=1.26 <2",
              fallback: null,
              version,
              status: version === "1.20.1" ? "too-old" : "found",
            },
          ],
        }),
  );
  const bridge = {
    call,
    on: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
  } as unknown as DesktopBridge;
  const { result, unmount } = renderHook(() => useTemplates(bridge));
  await waitFor(() => expect(result.current.detail.status).toBe("ready"));
  if (result.current.detail.status !== "ready") throw new Error("detail not ready");
  expect(result.current.detail.detail.tools[0]?.version).toBe("1.20.1");
  version = "1.26.2";
  act(() => listeners.get("toolchain.changed")?.());
  await waitFor(() =>
    expect(
      result.current.detail.status === "ready"
        ? result.current.detail.detail.tools[0]?.version
        : null,
    ).toBe("1.26.2"),
  );
  expect(result.current.selected).toBe(row.key);
  expect(call.mock.calls.filter(([method]) => method === "template.detail")).toHaveLength(2);
  expect(call.mock.calls.some(([method]) => method.startsWith("toolchain"))).toBe(false);
  unmount();
  expect(listeners.has("toolchain.changed")).toBe(false);
});

it("[DESKTOP-TEMPLATES-VIEW-03] 更新缓存期间的旧详情回包不能盖住新版本", async () => {
  const row = pageRow("go", "script");
  let calls = 0;
  let finish: (detail: ReturnType<typeof detailOf>) => void = () => {};
  let changed = () => {};
  const detail = (version: string) =>
    detailOf(row, {
      tools: [{ tool: "go", required: ">=1.26", fallback: null, version, status: "found" }],
    });
  const bridge = {
    call: async (method: string) => {
      if (method === "template.list") return [row];
      calls++;
      if (calls === 2)
        return new Promise<ReturnType<typeof detailOf>>((resolve) => {
          finish = resolve;
        });
      return detail(calls === 1 ? "1.26.1" : "1.26.3");
    },
    on: (_event: string, callback: () => void) => {
      changed = callback;
      return () => {};
    },
  } as unknown as DesktopBridge;
  const { result } = renderHook(() => useTemplates(bridge));
  await waitFor(() => expect(result.current.detail.status).toBe("ready"));
  act(() => changed());
  await waitFor(() => expect(calls).toBe(2));
  act(() => changed());
  await waitFor(() =>
    expect(
      result.current.detail.status === "ready"
        ? result.current.detail.detail.tools[0]?.version
        : null,
    ).toBe("1.26.3"),
  );
  await act(async () => finish(detail("1.26.2")));
  expect(
    result.current.detail.status === "ready"
      ? result.current.detail.detail.tools[0]?.version
      : null,
  ).toBe("1.26.3");
});
