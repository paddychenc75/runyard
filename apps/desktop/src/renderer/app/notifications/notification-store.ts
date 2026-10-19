import type { MessageKey, MessageValues } from "@runyard/i18n";
import type { IconName } from "@runyard/ui";

/** 保存文案键和参数，切换语言后重新翻译，不把某次界面语言写进持久记录。 */
export interface NotificationText {
  key: MessageKey;
  values?: MessageValues;
}
export interface NotificationRecord {
  id: string;
  at: number;
  required: boolean;
  tone: "accent" | "warning" | "violet" | "danger";
  icon: IconName;
  title: NotificationText;
  description?: NotificationText;
  /** 数据源注册动作处理器，记录中只存动作标识，不存可执行函数。 */
  actions?: readonly { id: string; label: NotificationText; primary?: boolean }[];
}
export interface NotificationStorage {
  read(): readonly NotificationRecord[];
  write(records: readonly NotificationRecord[]): void;
}
export interface NotificationSnapshot {
  required: readonly NotificationRecord[];
  recent: readonly NotificationRecord[];
  cards: readonly string[];
}
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** 来源通过 add / resolve 同步事实；关闭卡片不等于处理完成。 */
export class NotificationStore {
  private records: NotificationRecord[];
  private cards: string[];
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private state: NotificationSnapshot;
  private readonly storage: NotificationStorage;
  private readonly now: () => number;
  constructor(storage: NotificationStorage, now = Date.now) {
    this.storage = storage;
    this.now = now;
    this.records = [...storage.read()].filter((item) => item.required || item.at > now() - WEEK);
    this.cards = this.records
      .filter((item) => item.required)
      .slice(0, 3)
      .map((item) => item.id);
    for (const item of this.records) this.seen.add(item.id);
    this.state = this.build();
  }
  snapshot = (): NotificationSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  add(record: NotificationRecord): void {
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index >= 0) this.records[index] = record;
    else this.records.push(record);
    if (!this.seen.has(record.id) && this.cards.length < 3) this.cards.push(record.id);
    this.seen.add(record.id);
    this.publish();
  }
  dismiss(id: string): void {
    this.cards = this.cards.filter((value) => value !== id);
    this.publish();
  }
  resolve(id: string): void {
    this.records = this.records.filter((item) => item.id !== id);
    this.cards = this.cards.filter((value) => value !== id);
    this.publish();
  }
  clearRecent(): void {
    this.records = this.records.filter((item) => item.required);
    this.publish();
  }
  prune(): void {
    this.publish();
  }
  private build(): NotificationSnapshot {
    return {
      required: this.records.filter((item) => item.required),
      recent: this.records.filter((item) => !item.required).sort((a, b) => b.at - a.at),
      cards: [...this.cards],
    };
  }
  private publish(): void {
    this.records = this.records.filter((item) => item.required || item.at > this.now() - WEEK);
    this.cards = this.cards.filter((id) => this.records.some((item) => item.id === id));
    this.storage.write(this.records);
    this.state = this.build();
    for (const listener of this.listeners) listener();
  }
}
