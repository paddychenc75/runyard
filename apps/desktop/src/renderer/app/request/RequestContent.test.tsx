// @vitest-environment jsdom
import { createTranslator, desktopCatalogs, scanPageForLeaks } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { sampleTab } from "../sample-tab.ts";
import { RequestPanel } from "./RequestPanel.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("[DESKTOP-REQUEST-PANEL-01/04] 方法、状态和响应是技术内容，普通控件文案仍参加扫描", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: async (method: string) =>
      method === "request.send"
        ? {
            outcome: "response",
            status: 200,
            statusText: "OK",
            durationMs: 12,
            size: 20,
            headers: [{ name: "x-fixture", value: "Original header" }],
            payload: '{"message":"Original payload"}',
          }
        : null,
    on: () => () => {},
  } as unknown as DesktopBridge;
  const { t } = createTranslator({
    locale: "en-XA",
    platform: "darwin",
    catalogs: desktopCatalogs,
  });
  const { container } = render(
    <I18nProvider locale="en-XA" platform="darwin" catalogs={desktopCatalogs}>
      <RequestPanel bridge={bridge} tab={sampleTab({ service: true, port: 7100 })} />
    </I18nProvider>,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: t("desktop.request.send.action") }));
  await screen.findByText("200 OK");
  expect(container.textContent).toContain('"Original payload"');
  expect(scanPageForLeaks(container)).toEqual([]);
  const response = container.querySelector("[data-request-response]");
  if (!(response instanceof HTMLElement)) throw new Error("缺少响应区");
  await userEvent.setup().click(
    within(response).getByRole("button", {
      name: t("desktop.request.responseHeaders.label"),
    }),
  );
  expect(container.textContent).toContain("Original header");
  expect(scanPageForLeaks(container)).toEqual([]);
  const leaked = document.createElement("button");
  leaked.textContent = "Raw control";
  container.append(leaked);
  expect(scanPageForLeaks(container).map((item) => item.text)).toEqual(["Raw control"]);
});
