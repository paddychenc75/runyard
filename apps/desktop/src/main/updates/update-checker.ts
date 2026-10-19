import type { UpdateBannerView } from "../../shared/library-state.ts";
import type { UpdateRecord, UpdateStore } from "./update-record.ts";

// 检查更新（规格 DESKTOP-SETTINGS-26 至 30，技术设计 §12 第 11、24 项）：一天最多一次，
// 只问 GitHub Releases 的公开接口，不带任何标识，失败不出声，从不自己下载或安装。
// 这是应用唯一一次主动联网。命令行永远不查（DESKTOP-SETTINGS-31，只有桌面应用的主进程有这个模块）。

export const RELEASES_API = "https://api.github.com/repos/paddychenc75/runyard/releases/latest";
const RELEASES_PAGE = "https://github.com/paddychenc75/runyard/releases/";
const TIMEOUT_MS = 10_000;

/** 版本号 1.2.3（可带前缀 v）；预发布和带别的后缀的不算正式版 */
function versionParts(text: string): [number, number, number] | null {
  const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim());
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewer(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) > (b[i] as number);
  }
  return false;
}

export interface UpdateCheckerOptions {
  /** 当前版本 */
  current: string;
  fetch: typeof globalThis.fetch;
  store: UpdateStore;
  now(): Date;
  enabled(): Promise<boolean>;
  /** 提示条要显示的内容；不显示是 null */
  publish(view: UpdateBannerView | null): void;
  openExternal(url: string): void | Promise<void>;
  /** false 时只显示记录里已有的，绝不发请求（从源码运行和自动化测试里，不碰真实的 GitHub） */
  canFetch: boolean;
}

function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class UpdateChecker {
  readonly #options: UpdateCheckerOptions;
  #shown: UpdateRecord["latest"] = null;
  /** 开关连着拨两下会有两次 run 在途：只让最后一次落实，先发的结果作废 */
  #generation = 0;
  #writes: Promise<void> = Promise.resolve();

  constructor(options: UpdateCheckerOptions) {
    this.#options = options;
  }

  /** 打开应用时、或在设置里把开关打开时调用；开关关着就什么都不发、也不显示 */
  async run(): Promise<void> {
    const { store, publish } = this.#options;
    this.#generation += 1;
    const generation = this.#generation;
    const enabled = await this.#options.enabled();
    if (generation !== this.#generation) return;
    if (!enabled) {
      this.#shown = null;
      publish(null);
      return;
    }
    let record = await store.load();
    if (generation !== this.#generation) return;
    this.#present(record);
    const today = dayOf(this.#options.now());
    if (!this.#options.canFetch || record?.checkedOn === today) return;
    // 先记下今天查过：发出请求之后不管成败，今天都不再查
    await this.#writeRecord((current) => ({ ...current, checkedOn: today }));
    if (generation !== this.#generation) return;
    const latest = await this.#fetchLatest();
    if (latest === undefined || generation !== this.#generation) return;
    record = await this.#writeRecord((current) => ({ ...current, latest }));
    if (generation === this.#generation) this.#present(record);
  }

  /**
   * 菜单里的“检查更新…”：用户主动要的，所以不受“一天一次”和设置开关限制，并且忽略以前的“以后再说”；
   * 返回结果让调用方告诉用户（后台检查是静默的）。从源码运行（canFetch 为假）不联网。
   */
  async checkNow(): Promise<"newer" | "latest" | "failed" | "unavailable"> {
    if (!this.#options.canFetch) return "unavailable";
    this.#generation += 1;
    const generation = this.#generation;
    const latest = await this.#fetchLatest();
    if (latest === undefined) return "failed";
    // 结果被更晚的一次检查取代了：那一次会负责展示，这里不抢
    if (generation !== this.#generation) return latest === null ? "latest" : "newer";
    const record = await this.#writeRecord((current) => ({
      ...current,
      checkedOn: dayOf(this.#options.now()),
      latest,
      dismissed: null,
      handledVersion: null,
    }));
    if (generation === this.#generation) this.#present(record);
    return latest === null ? "latest" : "newer";
  }

  /** “以后再说”只由通知中心收起本次卡片，不改更新事实和持久处理记录。 */
  async later(): Promise<void> {}

  /** 浏览器拒绝打开时让调用方保留待处理；成功后只标记这次点击对应的版本。 */
  async download(): Promise<void> {
    const selected = this.#shown;
    if (selected === null) return;
    await this.#options.openExternal(selected.url);
    const next = await this.#writeRecord((current) => ({
      ...current,
      handledVersion: selected.version,
    }));
    // 等待浏览器时用户可能关了更新检查，不把已经隐藏的来源重新发布。
    if (this.#shown !== null) this.#present(next);
  }

  /** 检查回包与下载确认共享一次读改写队列，旧回包不能覆盖期间写下的处理结果。 */
  #writeRecord(update: (current: UpdateRecord) => UpdateRecord): Promise<UpdateRecord> {
    const next = this.#writes.then(async () => {
      const current = (await this.#options.store.load()) ?? {
        checkedOn: dayOf(this.#options.now()),
        latest: null,
        dismissed: null,
      };
      const result = update(current);
      await this.#options.store.save(result);
      return result;
    });
    // 调用者仍收到原始失败；队尾单独消费失败，让后续操作可以继续排队。
    this.#writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  #present(record: UpdateRecord | null): void {
    const latest = record?.latest ?? null;
    const visible =
      latest !== null &&
      isNewer(latest.version, this.#options.current) &&
      latest.version !== record?.handledVersion;
    this.#shown = visible ? latest : null;
    this.#options.publish(
      visible ? { latest: latest.version, current: this.#options.current } : null,
    );
  }

  /** undefined 是没查成（离线、限流、返回的东西不对）；null 是查到了但没有新版本 */
  async #fetchLatest(): Promise<UpdateRecord["latest"] | undefined> {
    try {
      // 不带 Cookie、令牌、设备或用户标识：只有一个固定的 User-Agent（GitHub 接口要求有）
      const response = await this.#options.fetch(RELEASES_API, {
        method: "GET",
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Runyard" },
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as Record<string, unknown>;
      if (body.draft === true || body.prerelease === true) return null;
      const tag = typeof body.tag_name === "string" ? body.tag_name : "";
      const parts = versionParts(tag);
      if (parts === null) return undefined;
      const version = parts.join(".");
      if (!isNewer(version, this.#options.current)) return null;
      const page = typeof body.html_url === "string" ? body.html_url : "";
      return { version, url: page.startsWith(RELEASES_PAGE) ? page : `${RELEASES_PAGE}latest` };
    } catch {
      return undefined;
    }
  }
}
