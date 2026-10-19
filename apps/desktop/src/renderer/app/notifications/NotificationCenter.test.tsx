// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { NotificationCenter } from "./NotificationCenter.tsx";
import { NotificationService } from "./notification-service.ts";
import { NotificationStore } from "./notification-store.ts";

afterEach(cleanup);
(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
it("[DESKTOP-NOTIFICATIONS-10] 到来的卡片不改变当前标签与焦点，入口计数只算待处理", async () => {
  const store = new NotificationStore({ read: () => [], write: () => {} });
  const service = new NotificationService(store);
  render(
    <I18nProvider locale="en" platform="darwin" catalogs={desktopCatalogs}>
      <input aria-label="搜索" />
      <button type="button" role="tab" aria-selected="true">
        project
      </button>
      <NotificationCenter service={service} />
    </I18nProvider>,
  );
  const input = screen.getByRole("textbox");
  input.focus();
  act(() => {
    store.add({
      id: "one",
      at: Date.now(),
      required: true,
      tone: "accent",
      icon: "info",
      title: { key: "desktop.window.title" },
    });
    store.add({
      id: "two",
      at: Date.now(),
      required: false,
      tone: "warning",
      icon: "warning",
      title: { key: "desktop.window.title" },
    });
  });
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("tab").getAttribute("aria-selected")).toBe("true");
  expect(screen.getAllByRole("status")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Notifications" }).getAttribute("data-count")).toBe(
    "1",
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Notifications" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Needs attention" })).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Clear all" }));
  expect(store.snapshot().required).toHaveLength(1);
  expect(store.snapshot().recent).toHaveLength(0);
});
