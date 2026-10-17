// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import type { RequestResult, RequestSpec } from "@runyard/protocol";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { sampleTab } from "../sample-tab.ts";
import { RequestPanel } from "./RequestPanel.tsx";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const todos = [{ id: 1, title: "写第一个模板", done: true }];
const ok = (
  extra: Partial<Extract<RequestResult, { outcome: "response" }>> = {},
): RequestResult => ({
  outcome: "response",
  status: 200,
  statusText: "OK",
  durationMs: 12,
  size: 156,
  headers: [{ name: "content-type", value: "application/json" }],
  payload: JSON.stringify(todos),
  ...extra,
});

interface Setup {
  last?: RequestSpec | null;
  /** 每次 request.send 的应答；不给就是 200 */
  answer?: (request: RequestSpec) => Promise<RequestResult> | RequestResult;
}

function setup(row: TabRow, options: Setup = {}) {
  const calls: [string, unknown][] = [];
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: vi.fn(async (method: string, param?: unknown) => {
      calls.push([method, param]);
      if (method === "request.getLast") return options.last ?? null;
      if (method === "request.send") {
        return (options.answer ?? (() => ok()))((param as { request: RequestSpec }).request);
      }
      return undefined;
    }),
    on: () => () => {},
  } as unknown as DesktopBridge;
  const view = (next: TabRow, locale: "zh-CN" | "en" = "zh-CN") => (
    <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
      <RequestPanel bridge={bridge} tab={next} />
    </I18nProvider>
  );
  const utils = render(view(row));
  const sends = () => calls.filter(([method]) => method === "request.send");
  return { ...utils, calls, sends, rerender: (next: TabRow) => utils.rerender(view(next)) };
}

const service = (extra: Partial<TabRow> = {}) =>
  sampleTab({ name: "hono-todo-api", port: 7102, service: true, ...extra });

const sentRequest = (sends: [string, unknown][], index: number): RequestSpec => {
  const call = sends[index];
  if (call === undefined) throw new Error("no request sent");
  return (call[1] as { request: RequestSpec }).request;
};
const methodButton = () => document.querySelector("[data-method]") as HTMLButtonElement;
const sendButton = () => screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;

describe("请求面板", () => {
  it("[DESKTOP-REQUEST-PANEL-01] 服务项目：方法 GET、地址前缀 127.0.0.1:7102、路径 /、发送、请求头和请求体页签、自动重发开关、复制为 curl、在浏览器中打开", async () => {
    setup(service());
    expect(methodButton().textContent).toBe("GET");
    expect(screen.getByText("127.0.0.1:7102")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "请求路径" }) as HTMLInputElement).value).toBe("/");
    expect(sendButton().disabled).toBe(false);
    const tabs = screen.getByRole("group", { name: "请求内容" });
    expect(within(tabs).getByRole("button", { name: "请求头" })).toBeTruthy();
    expect(within(tabs).getByRole("button", { name: "请求体" })).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "服务重载后自动重发" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "复制为 curl" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "在浏览器中打开" })).toBeTruthy();
    // 没有网页预览的地址栏
    expect(document.querySelector("[data-preview-pane]")).toBeNull();
  });

  it("[DESKTOP-REQUEST-PANEL-03] 发一个 GET：响应区写 200 OK、耗时和大小，响应体是格式化后的 JSON，响应头里有 content-type", async () => {
    const user = userEvent.setup();
    const { sends } = setup(service());
    const path = screen.getByRole("textbox", { name: "请求路径" });
    await user.clear(path);
    await user.type(path, "/todos");
    await user.click(sendButton());
    expect(await screen.findByText("200 OK")).toBeTruthy();
    expect(screen.getByText("12 ms · 156 B")).toBeTruthy();
    expect(sends()[0]?.[1]).toEqual({
      id: "a",
      request: { method: "GET", path: "/todos", headers: [], payload: "" },
    });
    const region = screen.getByRole("region", { name: "响应" });
    expect(region.textContent).toContain('"title": "写第一个模板"');
    expect(region.textContent).toContain('\n  {\n    "id": 1');
    await user.click(screen.getByRole("button", { name: "响应头" }));
    expect(screen.getByRole("region", { name: "响应" }).textContent).toContain("content-type");
    expect(screen.getByRole("region", { name: "响应" }).textContent).toContain("application/json");
  });

  it("[DESKTOP-REQUEST-PANEL-03] 路径框里按回车也发送", async () => {
    const user = userEvent.setup();
    const { sends } = setup(service());
    await user.type(screen.getByRole("textbox", { name: "请求路径" }), "todos{Enter}");
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sentRequest(sends(), 0).path).toBe("/todos");
  });

  it("[DESKTOP-REQUEST-PANEL-04] 方法选 POST，请求头加 content-type，请求体填 JSON：发出去的请求带着它们", async () => {
    const user = userEvent.setup();
    const { sends } = setup(service());
    await user.click(methodButton());
    await user.click(await screen.findByRole("menuitemradio", { name: "POST" }));
    await user.type(
      screen.getByRole("textbox", { name: "请求头" }),
      "content-type: application/json",
    );
    await user.click(screen.getByRole("button", { name: "请求体" }));
    await user.click(screen.getByRole("textbox", { name: "请求体" }));
    await user.paste('{"title":"x"}');
    await user.click(sendButton());
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sentRequest(sends(), 0)).toEqual({
      method: "POST",
      path: "/",
      headers: [{ name: "content-type", value: "application/json" }],
      payload: '{"title":"x"}',
    });
  });

  it("[DESKTOP-REQUEST-PANEL-05] 一次只发一个：在途时发送不响应，只发出一个请求", async () => {
    const user = userEvent.setup();
    let release: (value: RequestResult) => void = () => {};
    const { sends } = setup(service(), {
      answer: () =>
        new Promise<RequestResult>((resolve) => {
          release = resolve;
        }),
    });
    await user.click(sendButton());
    await user.click(sendButton());
    await user.type(screen.getByRole("textbox", { name: "请求路径" }), "{Enter}");
    expect(sends()).toHaveLength(1);
    expect(screen.getByText("正在等待响应…")).toBeTruthy();
    await act(async () => release(ok()));
    expect(await screen.findByText("200 OK")).toBeTruthy();
    // 响应回来之后又可以发了
    await user.click(sendButton());
    expect(sends()).toHaveLength(2);
  });

  it("[DESKTOP-REQUEST-PANEL-06] 服务启动中：发送不可点，旁边说明还没就绪；已停止的说明不同", async () => {
    const user = userEvent.setup();
    const { sends, rerender } = setup(service({ state: "starting", status: "starting" }));
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText("服务还没就绪，就绪后才能发送")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "请求路径" }), "{Enter}");
    expect(sends()).toHaveLength(0);
    rerender(service({ state: "stopped", status: "stopped", active: false }));
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText("服务没有在运行，运行后才能发送")).toBeTruthy();
    rerender(service({ state: "crashed", status: "crashed" }));
    expect(sendButton().disabled).toBe(true);
  });

  it("[DESKTOP-REQUEST-PANEL-07] 请求失败写明原因，不显示之前的响应", async () => {
    const user = userEvent.setup();
    let next: RequestResult = ok();
    setup(service(), { answer: () => next });
    await user.click(sendButton());
    expect(await screen.findByText("200 OK")).toBeTruthy();
    next = { outcome: "failed", reason: "timeout", durationMs: 30_000 };
    await user.click(sendButton());
    expect(await screen.findByText("等了 30 秒仍没有响应，已超时")).toBeTruthy();
    expect(screen.queryByText("200 OK")).toBeNull();
    expect(screen.queryByRole("region", { name: "响应" })).toBeNull();
    for (const [reason, text] of [
      ["unreachable", "连不上服务"],
      ["disconnected", "服务中途断开了连接"],
    ] as const) {
      next = { outcome: "failed", reason, durationMs: 1 };
      await user.click(sendButton());
      expect(await screen.findByText(text)).toBeTruthy();
    }
  });

  it("[DESKTOP-REQUEST-PANEL-08] 重新打开时恢复上一次的方法、路径、请求头和请求体", async () => {
    const user = userEvent.setup();
    setup(service(), {
      last: {
        method: "POST",
        path: "/todos",
        headers: [{ name: "content-type", value: "application/json" }],
        payload: '{"title":"x"}',
      },
    });
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "请求路径" }) as HTMLInputElement).value).toBe(
        "/todos",
      ),
    );
    expect(methodButton().textContent).toBe("POST");
    expect((screen.getByRole("textbox", { name: "请求头" }) as HTMLTextAreaElement).value).toBe(
      "content-type: application/json",
    );
    await user.click(screen.getByRole("button", { name: "请求体" }));
    expect((screen.getByRole("textbox", { name: "请求体" }) as HTMLTextAreaElement).value).toBe(
      '{"title":"x"}',
    );
  });
});

describe("服务重载后自动重发", () => {
  const sentTodos = (): RequestSpec => ({
    method: "GET",
    path: "/todos",
    headers: [],
    payload: "",
  });

  it("[DESKTOP-REQUEST-PANEL-09] 发过 GET /todos、开关开着：服务重载后重新就绪，自动重发上一次请求，响应区标注自动重发", async () => {
    const user = userEvent.setup();
    const { sends, rerender } = setup(service());
    const path = screen.getByRole("textbox", { name: "请求路径" });
    await user.clear(path);
    await user.type(path, "/todos");
    await user.click(sendButton());
    await screen.findByText("200 OK");
    expect(screen.queryByText(/^\d\d:\d\d:\d\d 自动重发$/)).toBeNull();
    // 重发用的是上一次发出的请求，不是此刻改到一半的内容
    await user.type(path, "x");
    rerender(service({ state: "reloading", status: "starting" }));
    expect(sends()).toHaveLength(1);
    rerender(service({ state: "ready" }));
    await waitFor(() => expect(sends()).toHaveLength(2));
    expect(sentRequest(sends(), 1)).toEqual(sentTodos());
    expect(await screen.findByText(/^\d\d:\d\d:\d\d 自动重发$/)).toBeTruthy();
  });

  it("[DESKTOP-REQUEST-PANEL-09] 重启后恢复的上一次请求也会自动重发（打开项目时已有记录）", async () => {
    const { sends, rerender } = setup(service(), { last: sentTodos() });
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "请求路径" }) as HTMLInputElement).value).toBe(
        "/todos",
      ),
    );
    rerender(service({ state: "reloading", status: "starting" }));
    rerender(service({ state: "ready" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
  });

  it("[DESKTOP-REQUEST-PANEL-10] 关掉开关：服务重载后不重发，响应区仍是上一次手动发送的结果", async () => {
    const user = userEvent.setup();
    const { sends, rerender } = setup(service());
    await user.click(sendButton());
    await screen.findByText("200 OK");
    await user.click(screen.getByRole("switch", { name: "服务重载后自动重发" }));
    expect(
      screen.getByRole("switch", { name: "服务重载后自动重发" }).getAttribute("aria-checked"),
    ).toBe("false");
    rerender(service({ state: "reloading", status: "starting" }));
    rerender(service({ state: "ready" }));
    await act(async () => {});
    expect(sends()).toHaveLength(1);
    expect(screen.getByText("200 OK")).toBeTruthy();
    expect(screen.queryByText(/^\d\d:\d\d:\d\d 自动重发$/)).toBeNull();
  });

  it("[DESKTOP-REQUEST-PANEL-09] 还没发过请求：服务重载后不自动重发", async () => {
    const { sends, rerender } = setup(service());
    rerender(service({ state: "reloading", status: "starting" }));
    rerender(service({ state: "ready" }));
    await act(async () => {});
    expect(sends()).toHaveLength(0);
  });

  it("[DESKTOP-REQUEST-PANEL-09] 不是文件变化引起的重新就绪（停止后再运行）不自动重发", async () => {
    const user = userEvent.setup();
    const { sends, rerender } = setup(service());
    await user.click(sendButton());
    await screen.findByText("200 OK");
    rerender(service({ state: "stopped", status: "stopped", active: false }));
    rerender(service({ state: "starting", status: "starting" }));
    rerender(service({ state: "ready" }));
    await act(async () => {});
    expect(sends()).toHaveLength(1);
  });
});

describe("复制为 curl 与在浏览器中打开", () => {
  it("[DESKTOP-REQUEST-PANEL-11] 复制为 curl：把当前填的请求写成 curl 命令放进剪贴板", async () => {
    const user = userEvent.setup();
    const { calls } = setup(service());
    await user.click(methodButton());
    await user.click(await screen.findByRole("menuitemradio", { name: "POST" }));
    const path = screen.getByRole("textbox", { name: "请求路径" });
    await user.clear(path);
    await user.type(path, "/todos");
    await user.type(
      screen.getByRole("textbox", { name: "请求头" }),
      "content-type: application/json",
    );
    await user.click(screen.getByRole("button", { name: "请求体" }));
    await user.click(screen.getByRole("textbox", { name: "请求体" }));
    await user.paste(`{"title":"it's"}`);
    await user.click(screen.getByRole("button", { name: "复制为 curl" }));
    expect(calls).toContainEqual([
      "clipboard.copy",
      `curl --globoff -X POST -H 'content-type: application/json' --data-raw '{"title":"it'\\''s"}' 'http://127.0.0.1:7102/todos'`,
    ]);
    expect(screen.getByRole("button", { name: "已复制" })).toBeTruthy();
  });

  it("[DESKTOP-REQUEST-PANEL-12] GET 时点“在浏览器中打开”：请求主进程用系统默认浏览器打开 127.0.0.1:端口加路径", async () => {
    const user = userEvent.setup();
    const { calls } = setup(service());
    const path = screen.getByRole("textbox", { name: "请求路径" });
    await user.clear(path);
    await user.type(path, "/todos");
    await user.click(screen.getByRole("button", { name: "在浏览器中打开" }));
    expect(calls).toContainEqual(["request.openInBrowser", { id: "a", path: "/todos" }]);
  });

  it("[DESKTOP-REQUEST-PANEL-12] 方法不是 GET 时“在浏览器中打开”不可点", async () => {
    const user = userEvent.setup();
    setup(service());
    await user.click(methodButton());
    await user.click(await screen.findByRole("menuitemradio", { name: "DELETE" }));
    expect(
      (screen.getByRole("button", { name: "在浏览器中打开" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("英文界面", () => {
  it("同一块面板在英文下的主要文字", async () => {
    setup(service(), {});
    cleanup();
    const utils = render(
      <I18nProvider locale="en" platform="darwin" catalogs={desktopCatalogs}>
        <RequestPanel
          bridge={
            {
              bootstrap: { platform: "darwin" },
              call: async () => null,
              on: () => () => {},
            } as unknown as DesktopBridge
          }
          tab={service()}
        />
      </I18nProvider>,
    );
    expect(utils.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(utils.getByRole("button", { name: "Copy as curl" })).toBeTruthy();
    expect(utils.getByRole("button", { name: "Open in browser" })).toBeTruthy();
    expect(utils.getByRole("switch", { name: "Resend after service reloads" })).toBeTruthy();
    expect(utils.getByText("The response will show here after you send a request")).toBeTruthy();
  });
});
