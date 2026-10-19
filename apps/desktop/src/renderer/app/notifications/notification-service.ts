import { createNotificationStorage } from "./notification-storage.ts";
import { NotificationStore, type NotificationText } from "./notification-store.ts";

/** #463 的数据源接入这里；只保存事实，动作在每次启动时重新登记，不从持久记录执行代码。 */
export class NotificationService {
  readonly actions = new Map<string, () => Promise<void>>();
  private listeners = new Set<() => void>();
  private toast: { id: number; message: NotificationText } | null = null;
  private nextToast = 0;
  readonly store: NotificationStore;
  constructor(store: NotificationStore) {
    this.store = store;
  }
  registerAction(id: string, action: () => Promise<void>): () => void {
    this.actions.set(id, action);
    return () => {
      if (this.actions.get(id) === action) this.actions.delete(id);
    };
  }
  showToast(message: NotificationText): void {
    this.toast = { id: ++this.nextToast, message };
    for (const listener of this.listeners) listener();
  }
  dismissToast = (): void => {
    this.toast = null;
    for (const listener of this.listeners) listener();
  };
  getToast = () => this.toast;
  subscribeToast = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
let service: NotificationService | undefined;
export function getNotificationService(): NotificationService {
  service ??= new NotificationService(
    new NotificationStore(
      createNotificationStorage({
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      }),
    ),
  );
  return service;
}
