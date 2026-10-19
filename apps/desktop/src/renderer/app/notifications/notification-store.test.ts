import { describe, expect, it } from "vitest";
import { type NotificationRecord, NotificationStore } from "./notification-store.ts";

const notice = (id: string, required = false, at = 0): NotificationRecord => ({
  id,
  required,
  at,
  tone: "accent",
  icon: "info",
  title: { key: "desktop.window.title" },
});
const setup = () => {
  let saved: NotificationRecord[] = [];
  let now = 0;
  const storage = {
    read: () => saved,
    write: (items: readonly NotificationRecord[]) => {
      saved = [...items];
    },
  };
  return {
    store: new NotificationStore(storage, () => now),
    storage,
    time: (value: number) => {
      now = value;
    },
  };
};

describe("通知仓库", () => {
  it("[DESKTOP-NOTIFICATIONS-01] 两条待处理通知成为卡片并计数", () => {
    const { store } = setup();
    store.add(notice("update", true));
    store.add(notice("clean", true));
    expect(store.snapshot().cards).toEqual(["update", "clean"]);
    expect(store.snapshot().required).toHaveLength(2);
  });
  it("[DESKTOP-NOTIFICATIONS-03] 第四张直接进入列表，不在已有卡片关闭后补弹", () => {
    const { store } = setup();
    for (let n = 0; n < 4; n++) store.add(notice(String(n)));
    expect(store.snapshot().cards).toEqual(["0", "1", "2"]);
    store.dismiss("0");
    expect(store.snapshot().cards).toEqual(["1", "2"]);
    expect(store.snapshot().recent).toHaveLength(4);
  });
  it("[DESKTOP-NOTIFICATIONS-04] 关闭只影响本次卡片，重启再次弹待处理", () => {
    const { store, storage } = setup();
    store.add(notice("update", true));
    store.dismiss("update");
    store.add(notice("update", true));
    expect(store.snapshot().cards).toEqual([]);
    expect(new NotificationStore(storage, () => 0).snapshot().cards).toEqual(["update"]);
  });
  it("[DESKTOP-NOTIFICATIONS-05] 分组持久保留，最近超过七天淘汰", () => {
    const { store, time } = setup();
    store.add(notice("required", true));
    store.add(notice("recent"));
    time(7 * 24 * 60 * 60 * 1000);
    store.prune();
    expect(store.snapshot().recent).toEqual([]);
    expect(store.snapshot().required).toHaveLength(1);
  });
  it("[DESKTOP-NOTIFICATIONS-06] 处理完成或条件失效移除待处理及卡片", () => {
    const { store, storage } = setup();
    store.add(notice("clean", true));
    store.resolve("clean");
    expect(store.snapshot().required).toEqual([]);
    expect(store.snapshot().cards).toEqual([]);
    expect(storage.read()).toEqual([]);
  });
  it("[DESKTOP-NOTIFICATIONS-07] 清空最近不会删除待处理", () => {
    const { store } = setup();
    store.add(notice("update", true));
    store.add(notice("agent"));
    store.clearRecent();
    expect(store.snapshot().required).toHaveLength(1);
    expect(store.snapshot().recent).toEqual([]);
  });
  it("[DESKTOP-NOTIFICATIONS-09] 一次性提醒收起后仍在最近，重复id不新增", () => {
    const { store } = setup();
    store.add(notice("missing"));
    store.dismiss("missing");
    store.add(notice("missing"));
    expect(store.snapshot().recent).toHaveLength(1);
    expect(store.snapshot().cards).toEqual([]);
  });
});
