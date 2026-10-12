import { describe, expect, it } from "vitest";
import type { EnvLoadResult } from "../../platform.ts";
import { type CacheTarget, ENV_FAILURE_TTL_MS, ENV_TTL_MS, EnvCache } from "./env-cache.ts";

const target: CacheTarget = { key: "zsh|fp", capture: { cwd: "/home" } };

function good(name: string): EnvLoadResult {
  return { env: { NAME: name }, source: "login-shell", ms: 5 };
}
const bad: EnvLoadResult = {
  env: { PATH: "/usr/bin" },
  source: "fallback",
  ms: 10_000,
  reason: "timeout",
};

// 可以逐个放行的解析器：测试决定每次解析何时、以什么结果结束
function harness(script: (EnvLoadResult | "reject")[]) {
  let time = 0;
  let calls = 0;
  const pending: ((r: EnvLoadResult | "reject") => void)[] = [];
  const cache = new EnvCache({
    now: () => time,
    resolve: () =>
      new Promise<EnvLoadResult>((resolve, reject) => {
        calls++;
        const next = script.shift();
        const done = (r: EnvLoadResult | "reject") =>
          r === "reject" ? reject(new Error("boom")) : resolve(r);
        if (next === undefined) pending.push(done);
        else done(next);
      }),
  });
  return {
    cache,
    advance: (ms: number) => {
      time += ms;
    },
    calls: () => calls,
    release: (r: EnvLoadResult | "reject") => pending.shift()?.(r),
  };
}

describe("EnvCache：先用旧值、后台刷新", () => {
  it("[TOOLCHAIN-DETECTION-18] 缓存过期时立即返回旧值，同时后台刷新，刷新完成后兑现新值", async () => {
    const h = harness([good("old"), good("new")]);
    expect((await h.cache.load(target, false)).env.NAME).toBe("old");
    h.advance(ENV_TTL_MS + 1);
    const stale = await h.cache.load(target, false);
    expect(stale.env.NAME).toBe("old"); // 不等刷新
    expect(stale.refreshing).toBeDefined();
    expect((await stale.refreshing)?.env.NAME).toBe("new");
    expect((await h.cache.load(target, false)).env.NAME).toBe("new");
    expect(h.calls()).toBe(2);
  });

  it("1 小时之内不重新解析，也不带 refreshing", async () => {
    const h = harness([good("a")]);
    await h.cache.load(target, false);
    h.advance(ENV_TTL_MS - 1);
    const again = await h.cache.load(target, false);
    expect(again.refreshing).toBeUndefined();
    expect(h.calls()).toBe(1);
  });

  it("同一个键同时只解析一次", async () => {
    const h = harness([]);
    const first = h.cache.load(target, false);
    const second = h.cache.load(target, false);
    await Promise.resolve();
    expect(h.calls()).toBe(1);
    h.release(good("shared"));
    expect((await first).env.NAME).toBe("shared");
    expect((await second).env.NAME).toBe("shared");
  });

  it("[TOOLCHAIN-DETECTION-12] refresh 为真：重新解析并替换缓存，不自动重试", async () => {
    const h = harness([good("old"), good("new")]);
    await h.cache.load(target, false);
    const fresh = await h.cache.load(target, true);
    expect(fresh.env.NAME).toBe("new");
    expect((await h.cache.load(target, false)).env.NAME).toBe("new");
    expect(h.calls()).toBe(2);
  });

  it("不同的键互不影响", async () => {
    const h = harness([good("a"), good("b")]);
    await h.cache.load(target, false);
    await h.cache.load({ key: "other", capture: { cwd: "/p" } }, false);
    expect(h.calls()).toBe(2);
  });
});

describe("EnvCache：失败", () => {
  it("[TOOLCHAIN-DETECTION-15] 第一次就失败：先给回退的结果，后台再试一次，重试成功后缓存换成好结果", async () => {
    const h = harness([bad, good("retry")]);
    const first = await h.cache.load(target, false);
    expect(first.source).toBe("fallback");
    expect(first.reason).toBe("timeout");
    expect((await first.refreshing)?.source).toBe("login-shell");
    expect((await h.cache.load(target, false)).source).toBe("login-shell");
    expect(h.calls()).toBe(2);
  });

  it("重试也失败：不再自动重试；过了失败缓存的时效才在下一次请求时后台再试", async () => {
    const h = harness([bad, bad, good("later")]);
    const first = await h.cache.load(target, false);
    await first.refreshing;
    expect(h.calls()).toBe(2);
    const again = await h.cache.load(target, false);
    expect(again.refreshing).toBeUndefined();
    expect(h.calls()).toBe(2);
    h.advance(ENV_FAILURE_TTL_MS + 1);
    const retry = await h.cache.load(target, false);
    expect(retry.source).toBe("fallback");
    expect((await retry.refreshing)?.source).toBe("login-shell");
  });

  it("后台刷新失败时保留旧的好结果", async () => {
    const h = harness([good("keep"), bad]);
    await h.cache.load(target, false);
    h.advance(ENV_TTL_MS + 1);
    await (await h.cache.load(target, false)).refreshing;
    const next = await h.cache.load(target, false);
    expect(next.env.NAME).toBe("keep");
    expect(next.source).toBe("login-shell");
  });

  it("解析器抛错也不会让 refreshing 失败，当作失败的回退结果", async () => {
    const h = harness(["reject", "reject"]);
    const first = await h.cache.load(target, false);
    expect(first.source).toBe("fallback");
    expect(first.reason).toBe("failed");
    await expect(first.refreshing).resolves.toMatchObject({ source: "fallback" });
  });
});
