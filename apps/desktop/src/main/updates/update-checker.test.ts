import { describe, expect, it, vi } from "vitest";
import type { UpdateBannerView } from "../../shared/library-state.ts";
import { isNewer, RELEASES_API, UpdateChecker } from "./update-checker.ts";
import type { UpdateRecord, UpdateStore } from "./update-record.ts";

// 检查更新（规格 DESKTOP-SETTINGS-26 至 30）：假的 fetch、假的存放处、假的时钟，不碰真实的网络

class MemoryStore implements UpdateStore {
  record: UpdateRecord | null;
  constructor(record: UpdateRecord | null = null) {
    this.record = record;
  }
  async load() {
    return this.record;
  }
  async save(record: UpdateRecord) {
    this.record = record;
  }
}

const release = (tag: string, extra: Record<string, unknown> = {}) =>
  Response.json({
    tag_name: tag,
    html_url: `https://github.com/paddychenc75/runyard/releases/tag/${tag}`,
    ...extra,
  });

function setup(
  options: {
    enabled?: boolean;
    store?: MemoryStore;
    reply?: () => Response | Promise<Response>;
    day?: Date;
    canFetch?: boolean;
    openExternal?: (url: string) => void | Promise<void>;
  } = {},
) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const shown: (UpdateBannerView | null)[] = [];
  const opened: string[] = [];
  const store = options.store ?? new MemoryStore();
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return await (options.reply ?? (() => release("v0.3.0")))();
  }) as typeof globalThis.fetch;
  const checker = new UpdateChecker({
    current: "0.2.0",
    fetch,
    store,
    now: () => options.day ?? new Date(2026, 9, 18, 10, 0, 0),
    enabled: async () => options.enabled ?? true,
    publish: (view) => void shown.push(view),
    openExternal: options.openExternal ?? ((url) => void opened.push(url)),
    canFetch: options.canFetch ?? true,
  });
  return { checker, requests, shown, opened, store };
}

describe("检查更新", () => {
  it("[DESKTOP-SETTINGS-26] 有新版本：提示条写新旧版本，“下载”打开发布页，应用自己不下载", async () => {
    const { checker, shown, opened, requests } = setup();
    await checker.run();
    expect(shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
    await checker.download();
    expect(opened).toEqual(["https://github.com/paddychenc75/runyard/releases/tag/v0.3.0"]);
    // 唯一的请求是查发布信息，没有第二个地址（不下载安装包）
    expect(requests.map((request) => request.url)).toEqual([RELEASES_API]);
  });

  it("[DESKTOP-SETTINGS-26] 当前已是最新、更旧或只有预发布和草稿时不提示", async () => {
    for (const reply of [
      () => release("v0.2.0"),
      () => release("v0.1.9"),
      () => release("v0.3.0", { prerelease: true }),
      () => release("v0.3.0", { draft: true }),
      () => release("nightly-2026"),
    ]) {
      const { checker, shown } = setup({ reply });
      await checker.run();
      expect(shown.at(-1)).toBeNull();
    }
  });

  it("[DESKTOP-SETTINGS-27] 今天已经检查过：再次打开不发请求，但提示条仍在", async () => {
    const store = new MemoryStore();
    await setup({ store }).checker.run();
    const again = setup({ store });
    await again.checker.run();
    expect(again.requests).toEqual([]);
    expect(again.shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
  });

  it("[DESKTOP-SETTINGS-27] 隔了一天会再查一次", async () => {
    const store = new MemoryStore();
    await setup({ store, day: new Date(2026, 9, 17, 23, 59) }).checker.run();
    const next = setup({ store, day: new Date(2026, 9, 18, 0, 1) });
    await next.checker.run();
    expect(next.requests).toHaveLength(1);
  });

  it("[DESKTOP-SETTINGS-27] 发出请求就算今天查过，失败了今天也不再试", async () => {
    const store = new MemoryStore();
    await setup({
      store,
      reply: () => {
        throw new Error("offline");
      },
    }).checker.run();
    const next = setup({ store });
    await next.checker.run();
    expect(next.requests).toEqual([]);
  });

  it("[DESKTOP-SETTINGS-28] 请求只去 GitHub Releases 的公开接口，不带 Cookie、令牌或任何标识", async () => {
    const { checker, requests } = setup();
    await checker.run();
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0] ?? { url: "", init: undefined };
    expect(new URL(url).origin).toBe("https://api.github.com");
    expect(new URL(url).pathname).toBe("/repos/paddychenc75/runyard/releases/latest");
    expect(new URL(url).search).toBe("");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    expect(init?.body).toBeUndefined();
    const names = Object.keys((init?.headers ?? {}) as Record<string, string>).map((name) =>
      name.toLowerCase(),
    );
    expect(names.sort()).toEqual(["accept", "user-agent"]);
  });

  it("[DESKTOP-SETTINGS-29] 离线或接口出错：界面上没有任何提示或错误", async () => {
    for (const reply of [
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("rate limited", { status: 403 }),
      () => new Response("not json", { status: 200 }),
      () => Response.json({ unexpected: true }),
    ]) {
      const { checker, shown } = setup({ reply });
      await expect(checker.run()).resolves.toBeUndefined();
      expect(shown.filter((view) => view !== null)).toEqual([]);
    }
  });

  it("[DESKTOP-SETTINGS-30] 关掉开关：不发任何请求，也不显示提示条", async () => {
    const store = new MemoryStore({
      checkedOn: "2020-01-01",
      latest: { version: "0.3.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
      dismissed: null,
    });
    const { checker, requests, shown } = setup({ enabled: false, store });
    await checker.run();
    expect(requests).toEqual([]);
    expect(shown.at(-1)).toBeNull();
  });

  it("[DESKTOP-SETTINGS-30] 开关连着拨关再拨开时，先发出的“关”不会盖掉后来的“开”", async () => {
    const store = new MemoryStore({
      checkedOn: "2026-10-18",
      latest: { version: "0.3.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
      dismissed: null,
    });
    const flags: boolean[] = [false, true];
    const gates: (() => void)[] = [];
    const shown: (UpdateBannerView | null)[] = [];
    const checker = new UpdateChecker({
      current: "0.2.0",
      fetch: (async () => Response.json({})) as typeof globalThis.fetch,
      store,
      now: () => new Date(2026, 9, 18),
      // 先发的 run 读到“关”但迟迟不返回，后发的读到“开”先完成
      enabled: () =>
        new Promise<boolean>((resolve) => {
          const value = flags.shift() ?? true;
          if (value) resolve(value);
          else gates.push(() => resolve(value));
        }),
      publish: (view) => void shown.push(view),
      openExternal: () => {},
      canFetch: true,
    });
    const first = checker.run();
    const second = checker.run();
    await second;
    gates.forEach((open) => void open());
    await first;
    expect(shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
  });

  it("不能联网的运行方式（从源码、自动化测试）只显示记录里已有的，不发请求", async () => {
    const { checker, requests, shown } = setup({ canFetch: false });
    await checker.run();
    expect(requests).toEqual([]);
    expect(shown.at(-1)).toBeNull();
  });

  it("[DESKTOP-NOTIFICATIONS-04] 以后再说不处理更新，下次启动仍可提示", async () => {
    const store = new MemoryStore();
    const first = setup({ store });
    await first.checker.run();
    await first.checker.later();
    expect(first.shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
    const reopened = setup({ store });
    await reopened.checker.run();
    expect(reopened.shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
  });
  it("[DESKTOP-NOTIFICATIONS-06] 下载请求成功后才处理，重启不再列同版本", async () => {
    const store = new MemoryStore();
    const first = setup({ store });
    await first.checker.run();
    await first.checker.download();
    expect(first.shown.at(-1)).toBeNull();
    const reopened = setup({ store });
    await reopened.checker.run();
    expect(reopened.shown.at(-1)).toBeNull();
  });
  it("[DESKTOP-NOTIFICATIONS-06] 浏览器打开失败保留待处理版本，随后可以重试", async () => {
    const store = new MemoryStore();
    let fail = true;
    const first = setup({
      store,
      openExternal: async () => {
        if (fail) throw Error("open failed");
      },
    });
    await first.checker.run();
    await expect(first.checker.download()).rejects.toThrow("open failed");
    expect(first.shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
    fail = false;
    await first.checker.download();
    expect(first.shown.at(-1)).toBeNull();
  });
  it("[DESKTOP-NOTIFICATIONS-04] 旧记录的以后再说不再被当作已处理", async () => {
    const store = new MemoryStore({
      checkedOn: "2026-10-18",
      latest: { version: "0.3.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
      dismissed: "0.3.0",
    });
    const first = setup({ store });
    await first.checker.run();
    expect(first.shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
  });

  it("发布页地址不在本仓库的发布页下时，“下载”打开默认的发布页", async () => {
    const { checker, opened } = setup({
      reply: () => release("v0.3.0", { html_url: "https://evil.example/phish" }),
    });
    await checker.run();
    await checker.download();
    expect(opened).toEqual(["https://github.com/paddychenc75/runyard/releases/latest"]);
  });
});

describe("手动检查更新（菜单“检查更新…”）", () => {
  it("今天已经查过、设置里关着开关也照样去查，查到新版本就显示提示条并忽略以前的“以后再说”", async () => {
    const store = new MemoryStore({
      checkedOn: "2026-10-18",
      latest: {
        version: "0.3.0",
        url: "https://github.com/paddychenc75/runyard/releases/tag/v0.3.0",
      },
      dismissed: "0.3.0",
    });
    const { checker, requests, shown } = setup({ store, enabled: false });
    expect(await checker.checkNow()).toBe("newer");
    expect(requests).toHaveLength(1);
    expect(shown.at(-1)).toEqual({ latest: "0.3.0", current: "0.2.0" });
    expect(store.record?.dismissed).toBeNull();
  });

  it("没有新版本返回 latest，请求失败返回 failed，都不改提示条", async () => {
    const latest = setup({ reply: () => release("v0.2.0") });
    expect(await latest.checker.checkNow()).toBe("latest");
    const failed = setup({ reply: () => new Response("", { status: 500 }) });
    expect(await failed.checker.checkNow()).toBe("failed");
    expect(failed.shown).toEqual([]);
  });

  it("不能联网的运行方式（从源码）不发请求，返回 unavailable", async () => {
    const { checker, requests } = setup({ canFetch: false });
    expect(await checker.checkNow()).toBe("unavailable");
    expect(requests).toEqual([]);
  });
});

describe("版本比较", () => {
  it("按数字而不是文字比较，预发布后缀不算正式版", () => {
    expect(isNewer("0.10.0", "0.9.0")).toBe(true);
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.3.0-rc.1", "0.2.0")).toBe(false);
    expect(isNewer("garbage", "0.2.0")).toBe(false);
  });
});

it("[DESKTOP-NOTIFICATIONS-06] 后台检查的旧回包不恢复已处理的同版本通知", async () => {
  const store = new MemoryStore({
    checkedOn: "2020-01-01",
    latest: { version: "0.3.0", url: "https://github.com/paddychenc75/runyard/releases/latest" },
    dismissed: null,
  });
  let respond: ((response: Response) => void) | undefined;
  const h = setup({
    store,
    reply: () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  });
  const checking = h.checker.run();
  await vi.waitFor(() => expect(h.requests).toHaveLength(1));
  await h.checker.download();
  expect(h.shown.at(-1)).toBeNull();
  respond?.(release("v0.3.0"));
  await checking;
  expect(store.record?.handledVersion).toBe("0.3.0");
  expect(h.shown.at(-1)).toBeNull();
});
