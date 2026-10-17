import { clientError, type EventListener, type EventSubscription } from "@runyard/client";
import type { EventTopic } from "@runyard/protocol";
import type { LibraryClient } from "./controller-hosts.ts";

// 管理进程被换掉、重启或意外退出后，应用要自己重新连上并重读状态（#358，决策记录 0005）：
// 否则连接一断，应用就一直对着已经退出的进程，再也看不到命令行新建的项目。
// 对控制器它仍是一个 LibraryClient：调用和订阅不变，重连在底下发生。

/** 底层连接：RunyardClient 里这里用到的部分 */
export interface LiveClient extends LibraryClient {
  readonly closed: Promise<void>;
  close(): void;
}

export interface ReconnectingOptions {
  /** 重新连（必要时拉起）管理进程；失败抛错 */
  connect(): Promise<LiveClient>;
  /** 连上新的管理进程之后：重读全部状态 */
  onReconnected(): void | Promise<void>;
  /** 每次失败之后等多久再试；用完了就放弃这一轮，下一次调用会再起一轮 */
  retryDelaysMs?: readonly number[];
  sleep(ms: number): Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [200, 500, 1000, 2000, 4000];

interface Registered {
  open(client: LibraryClient, listener: EventListener): Promise<EventSubscription>;
  listener: EventListener;
  inner: EventSubscription | undefined;
}

export class ReconnectingClient implements LibraryClient {
  readonly #options: ReconnectingOptions;
  readonly #registered = new Set<Registered>();
  #current: LiveClient;
  #down = false;
  #disposed = false;
  #pending: Promise<void> | undefined;

  constructor(first: LiveClient, options: ReconnectingOptions) {
    this.#options = options;
    this.#current = first;
    this.#watch(first);
  }

  call: LibraryClient["call"] = async (method, params) => {
    if (this.#down && !this.#disposed) await this.#reconnect();
    return this.#current.call(method, params);
  };

  subscribe: LibraryClient["subscribe"] = (topics, listener) =>
    this.#register(
      (client, wrapped) =>
        client.subscribe(topics as readonly [EventTopic, ...EventTopic[]], wrapped),
      listener,
    );

  followLogs: LibraryClient["followLogs"] = (params, listener) =>
    this.#register((client, wrapped) => client.followLogs(params, wrapped), listener);

  /** 不再重连（应用退出：道别之后连接会断，那不是要重连的断开） */
  stopReconnecting(): void {
    this.#disposed = true;
  }

  /** 不再重连，并断开当前连接 */
  close(): void {
    this.#disposed = true;
    this.#current.close();
  }

  async #register(open: Registered["open"], listener: EventListener): Promise<EventSubscription> {
    if (this.#down) await this.#reconnect();
    const entry: Registered = { open, listener, inner: undefined };
    entry.inner = await open(this.#current, listener);
    this.#registered.add(entry);
    return {
      get sub() {
        return entry.inner?.sub ?? -1;
      },
      unsubscribe: async () => {
        this.#registered.delete(entry);
        await entry.inner?.unsubscribe();
      },
    };
  }

  #watch(client: LiveClient): void {
    void client.closed.then(() => {
      if (this.#disposed || this.#current !== client) return;
      this.#down = true;
      // 这一轮失败不抛：下一次调用会再起一轮并拿到错误
      void this.#reconnect().catch(() => undefined);
    });
  }

  #reconnect(): Promise<void> {
    this.#pending ??= this.#reconnectRound().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  async #reconnectRound(): Promise<void> {
    const delays = this.#options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    for (let attempt = 0; !this.#disposed; attempt++) {
      try {
        const client = await this.#options.connect();
        if (this.#disposed) {
          client.close();
          return;
        }
        await this.#resubscribe(client);
        this.#current = client;
        this.#down = false;
        this.#watch(client);
        await this.#options.onReconnected();
        return;
      } catch {
        const delay = delays[attempt];
        if (delay === undefined) break;
        await this.#options.sleep(delay);
      }
    }
    // 这一轮没连上：保持“已断开”，调用方拿到 SUPERVISOR_UNAVAILABLE；下一次调用再起一轮
    if (this.#down) throw clientError("SUPERVISOR_UNAVAILABLE", {}, "could not reconnect");
  }

  async #resubscribe(client: LiveClient): Promise<void> {
    for (const entry of this.#registered) {
      // 新连接的 seq 从头数；第一条事件标 gap，提醒订阅方中间可能漏过东西，应重读快照
      let first = true;
      entry.inner = await entry.open(client, (event) => {
        const marked = first ? { ...event, gap: true } : event;
        first = false;
        entry.listener(marked);
      });
    }
  }
}
