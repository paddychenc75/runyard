import { expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import { NotificationService } from "./notification-service.ts";
import { NotificationSourcesController } from "./notification-sources-controller.ts";
import { NotificationStore } from "./notification-store.ts";

const state = (extra: Partial<LibraryState> = {}): LibraryState =>
  ({
    loaded: true,
    playgrounds: [],
    notices: [],
    cleanReminder: [],
    update: null,
    updateReady: true,
    error: null,
    ...extra,
  }) as LibraryState;
function setup(initial = state()) {
  let current = initial;
  const call = vi.fn(async (method: string) => (method === "library.get" ? current : undefined));
  const service = new NotificationService(
    new NotificationStore({ read: () => [], write: () => {} }),
  );
  const ask = vi.fn(async () => false);
  const failed = vi.fn();
  const controller = new NotificationSourcesController(
    service,
    { call } as unknown as DesktopBridge,
    ask,
    failed,
  );
  return {
    service,
    controller,
    call,
    ask,
    failed,
    set: (value: LibraryState) => {
      current = value;
    },
  };
}
it("[DESKTOP-SETTINGS-26] [DESKTOP-NOTIFICATIONS-04] 稍后再说保留待处理和版本事实", async () => {
  const { service, controller, call } = setup();
  controller.sync(state({ update: { latest: "0.3.0", current: "0.2.0" } }));
  await service.actions.get("update:0.3.0:later")?.();
  expect(service.store.snapshot().cards).toEqual([]);
  expect(service.store.snapshot().required).toHaveLength(1);
  expect(call).not.toHaveBeenCalledWith("update.later");
  controller.sync(state({ update: { latest: "0.3.0", current: "0.2.0" } }));
  expect(service.store.snapshot().cards).toEqual([]);
});
it("[DESKTOP-LIBRARY-VIEW-58] 没实际展示不ack，只有可见卡片回报时才ack", () => {
  const { service, controller, call } = setup();
  controller.sync(state({ cleanReminder: [{ id: "a", name: "a", idleDays: 29 }] }));
  expect(call).not.toHaveBeenCalledWith("clean.shown", expect.anything());
  service.markShown(["other"]);
  expect(call).not.toHaveBeenCalledWith("clean.shown", expect.anything());
  service.markShown(["clean:a"]);
  expect(call).toHaveBeenCalledWith("clean.shown", ["a"]);
});
it("[DESKTOP-LIBRARY-VIEW-59] 关闭自动清理失败保留待处理，成功以真实状态移除", async () => {
  const reminder = { id: "a", name: "a", idleDays: 29 };
  const original = state({ cleanReminder: [reminder] });
  const { service, controller, set } = setup(original);
  controller.sync(original);
  expect(await service.actions.get("clean:a:keep")?.()).toBe(false);
  expect(service.store.snapshot().required).toHaveLength(1);
  set(state());
  expect(await service.actions.get("clean:a:keep")?.()).toBe(true);
  expect(service.store.snapshot().required).toEqual([]);
});
it("[DESKTOP-LIBRARY-VIEW-60] 清理确认取消不会当作处理，关闭卡片仍在需要处理", async () => {
  const original = state({
    cleanReminder: [{ id: "a", name: "a", idleDays: 29 }],
    playgrounds: [{ id: "a", name: "a" } as never],
  });
  const { service, controller, ask } = setup(original);
  controller.sync(original);
  expect(await service.actions.get("clean:a:now")?.()).toBe(false);
  expect(ask).toHaveBeenCalledWith("a");
  expect(service.store.snapshot().required).toHaveLength(1);
  service.store.dismiss("clean:a");
  controller.sync(original);
  expect(service.store.snapshot().cards).toEqual([]);
  expect(service.store.snapshot().required).toHaveLength(1);
});
it("[DESKTOP-NOTIFICATIONS-09] 链接提醒入最近，清空后同一条主进程队列不会回来", () => {
  const original = state({
    notices: [{ id: "l", kind: "link", code: "open-missing", value: "nope" }],
  });
  const { service, controller, call } = setup();
  controller.sync(original);
  expect(service.store.snapshot().recent).toHaveLength(1);
  expect(call).toHaveBeenCalledWith("notice.dismiss", "l");
  service.store.clearRecent();
  controller.sync(original);
  expect(service.store.snapshot().recent).toEqual([]);
});
