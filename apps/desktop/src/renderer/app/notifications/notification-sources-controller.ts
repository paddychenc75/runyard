import type { MessageKey, MessageValues } from "@runyard/i18n";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type {
  AppNotice,
  CleanReminderItem,
  DesktopError,
  LibraryState,
} from "../../../shared/library-state.ts";
import {
  cleanNotification,
  transientNotification,
  updateNotification,
} from "./notification-records.ts";
import type { NotificationService } from "./notification-service.ts";
import type { NotificationRecord } from "./notification-store.ts";

/** 接收真实来源事实；卡片的关闭不改变事实，处理完成必须重新核对主进程状态。 */
export class NotificationSourcesController {
  private readonly service: NotificationService;
  private readonly bridge: DesktopBridge;
  private readonly askTrash: (id: string) => Promise<boolean>;
  private readonly failed: (error: DesktopError) => void;
  private readonly seen = new Set<string>();
  private readonly agents = new Map<string, AppNotice>();
  private readonly registrations = new Map<string, () => void>();
  private readonly stopShown: () => void;
  private library: LibraryState | null = null;
  private clean: readonly CleanReminderItem[] = [];
  private cleanId = "";
  private lastError = "";
  private lastShown = "";
  private errorSequence = 0;
  constructor(
    service: NotificationService,
    bridge: DesktopBridge,
    askTrash: (id: string) => Promise<boolean>,
    failed: (error: DesktopError) => void,
  ) {
    this.service = service;
    this.bridge = bridge;
    this.askTrash = askTrash;
    this.failed = failed;
    this.stopShown = service.subscribeShown((ids) => {
      const shown = ids.includes(this.cleanId) ? this.cleanId : "";
      if (shown === this.lastShown) return;
      this.lastShown = shown;
      if (shown && this.clean.length)
        void bridge
          .call(
            "clean.shown",
            this.clean.map((item) => item.id),
          )
          .catch((error) => console.error("NOTIFICATION_ACK_FAILED", error));
    });
  }
  sync(library: LibraryState): void {
    this.library = library;
    this.syncError(library.error);
    if (!library.loaded) return;
    if (library.updateReady !== false && library.update !== undefined) this.syncUpdate(library);
    this.syncClean(library.cleanReminder ?? []);
    for (const notice of library.notices ?? []) this.ingest(notice, library);
    for (const notice of this.agents.values()) {
      const previous = this.records().find((item) => item.id === `notice:${notice.id}`);
      if (previous)
        this.service.store.add(transientNotification(notice, previous.at, library.playgrounds));
    }
  }
  dispose(): void {
    this.stopShown();
    for (const unregister of this.registrations.values()) unregister();
    this.registrations.clear();
  }
  private records() {
    const state = this.service.store.snapshot();
    return [...state.required, ...state.recent];
  }
  private at(id: string): number {
    return this.records().find((item) => item.id === id)?.at ?? Date.now();
  }
  private retain(prefix: string, id: string | null): void {
    for (const item of this.service.store.snapshot().required)
      if (item.id.startsWith(prefix) && item.id !== id) this.service.store.resolve(item.id);
  }
  private action(id: string, handler: () => Promise<void | boolean>): void {
    this.registrations.get(id)?.();
    this.registrations.set(
      id,
      this.service.registerAction(id, async () => {
        try {
          return await handler();
        } catch (error) {
          console.error("NOTIFICATION_SOURCE_FAILED", error);
          this.failed(this.library?.error ?? { code: "INTERNAL", params: {} });
          return false;
        }
      }),
    );
  }
  private syncUpdate(library: LibraryState): void {
    const update = library.update;
    if (!update) {
      this.retain("update:", null);
      return;
    }
    const record = updateNotification(update, this.at(`update:${update.latest}`));
    this.retain("update:", record.id);
    this.action(`${record.id}:later`, async () => {
      this.service.store.dismiss(record.id);
    });
    this.action(`${record.id}:download`, async () => {
      await this.bridge.call("update.download");
      const fresh = await this.bridge.call("library.get");
      this.sync(fresh);
      return fresh.update?.latest !== update.latest;
    });
    this.service.store.add(record);
  }
  private syncClean(items: readonly CleanReminderItem[]): void {
    this.clean = items;
    if (!items.length) {
      this.cleanId = "";
      this.retain("clean:", null);
      return;
    }
    const record = cleanNotification(items, Date.now());
    record.at = this.at(record.id);
    this.cleanId = record.id;
    this.retain("clean:", record.id);
    const ids = items.map((item) => item.id);
    this.action(`${record.id}:keep`, async () => {
      await this.bridge.call("clean.keep", ids);
      const fresh = await this.bridge.call("library.get");
      this.sync(fresh);
      const remaining = (fresh.cleanReminder ?? []).some((item) => ids.includes(item.id));
      if (remaining && fresh.error) this.failed(fresh.error);
      return !remaining;
    });
    this.action(`${record.id}:now`, async () => {
      for (const id of ids)
        if (this.library?.playgrounds.some((item) => item.id === id) && !(await this.askTrash(id)))
          return false;
      this.sync(await this.bridge.call("library.get"));
      return true;
    });
    this.service.store.add(record);
  }
  private ingest(notice: AppNotice, library: LibraryState): void {
    if (this.seen.has(notice.id)) return;
    this.seen.add(notice.id);
    const at = notice.kind === "agent-run" ? notice.at : Date.now();
    const record = transientNotification(notice, at, library.playgrounds);
    if (notice.kind === "agent-run") {
      this.agents.set(notice.id, notice);
      this.action(`${record.id}:open`, async () => {
        await this.bridge.call("tab.open", notice.playgroundId);
        const fresh = await this.bridge.call("library.get");
        return fresh.tabs.some((tab) => tab.id === notice.playgroundId);
      });
      this.action(`${record.id}:stop`, async () => {
        await this.bridge.call("run.stop", notice.playgroundId);
        const fresh = await this.bridge.call("library.get");
        return !fresh.playgrounds.some((row) => row.id === notice.playgroundId && row.active);
      });
    }
    this.service.store.add(record);
    // 记录已进入历史，清掉主进程的一次性队列，避免“全部清除”之后被旧队列补回来。
    void this.bridge
      .call("notice.dismiss", notice.id)
      .catch((error) => console.error("NOTIFICATION_INGEST_ACK_FAILED", error));
  }
  private syncError(error: DesktopError | null): void {
    if (!error) {
      this.lastError = "";
      return;
    }
    const key = JSON.stringify(error);
    if (key === this.lastError) return;
    this.lastError = key;
    const values = Object.fromEntries(
      Object.entries(error.params).filter(
        ([, value]) => typeof value === "string" || typeof value === "number",
      ),
    ) as MessageValues;
    const record: NotificationRecord = {
      id: `failure:${Date.now()}:${++this.errorSequence}`,
      at: Date.now(),
      required: false,
      tone: "danger",
      icon: "exclamation",
      title: { key: `errors.${error.code}.title` as MessageKey, values },
      description: { key: `errors.${error.code}.body` as MessageKey, values },
    };
    this.service.store.add(record);
  }
}
