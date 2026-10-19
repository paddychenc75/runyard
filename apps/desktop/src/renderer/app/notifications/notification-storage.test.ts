import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "./notification-service.ts";
import { createNotificationStorage, NOTIFICATION_STORAGE_KEY } from "./notification-storage.ts";
import { type NotificationRecord, NotificationStore } from "./notification-store.ts";

const record: NotificationRecord = {
  id: "one",
  at: 1,
  required: true,
  tone: "accent",
  icon: "info",
  title: { key: "desktop.window.title" },
};
describe("通知持久化", () => {
  it("恢复时过滤坏条目，写入保留键与参数", () => {
    const setItem = vi.fn();
    const storage = createNotificationStorage({
      getItem: () => JSON.stringify([record, { ...record, title: { key: "missing.key" } }, null]),
      setItem,
    });
    expect(storage.read()).toEqual([record]);
    storage.write([record]);
    expect(setItem).toHaveBeenCalledWith(NOTIFICATION_STORAGE_KEY, JSON.stringify([record]));
  });
  it("存储不可用时保留会话内通知并输出诊断", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = createNotificationStorage({
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("quota");
      },
    });
    const store = new NotificationStore(storage, () => 1);
    store.add(record);
    expect(store.snapshot().required).toEqual([record]);
    expect(log.mock.calls.map((call) => call[0])).toEqual([
      "NOTIFICATION_STORAGE_READ_FAILED",
      "NOTIFICATION_STORAGE_WRITE_FAILED",
    ]);
    log.mockRestore();
  });
  it("[DESKTOP-NOTIFICATIONS-08] 成功提示不会写入通知历史，替换后只留最新一条", () => {
    const write = vi.fn();
    const store = new NotificationStore({ read: () => [], write });
    const service = new NotificationService(store);
    service.showToast({ key: "desktop.window.title" });
    service.showToast({ key: "desktop.window.title" });
    expect(service.getToast()?.id).toBe(2);
    expect(write).not.toHaveBeenCalled();
    expect(store.snapshot().recent).toEqual([]);
    service.dismissToast();
    expect(service.getToast()).toBeNull();
  });
});
