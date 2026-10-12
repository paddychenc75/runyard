import type { EnvLoadResult } from "../../platform.ts";

// 环境缓存：键由调用方算（登录 shell、启动文件指纹、项目指纹），这里只管时效与“先用旧值、后台刷新”。
// 谁拥有它：技术设计 §4.8 和 issue #26 把缓存放在平台层；#34（core）只管工具检测结果的缓存和
// `toolchain.changed` 事件，靠返回值里的 `refreshing` 知道后台刷新何时完成（见 EnvLoadResult）。

/** 成功的结果 1 小时有效（规格 TOOLCHAIN-DETECTION 的缓存要求） */
export const ENV_TTL_MS = 60 * 60 * 1000;
/** 失败（fallback）的结果只留这么久，过后下一次请求会在后台重试 */
export const ENV_FAILURE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 64;

export interface CacheTarget {
  readonly key: string;
  /** 实际解析所需的参数由调用方放在这里，缓存不看 */
  readonly capture: { readonly cwd: string };
}

interface Entry {
  result: EnvLoadResult;
  at: number;
}

export interface EnvCacheDeps {
  now(): number;
  resolve(target: CacheTarget): Promise<EnvLoadResult>;
}

function isFailure(result: EnvLoadResult): boolean {
  return result.source === "fallback";
}

export class EnvCache {
  readonly #deps: EnvCacheDeps;
  readonly #entries = new Map<string, Entry>();
  readonly #inflight = new Map<string, Promise<EnvLoadResult>>();

  constructor(deps: EnvCacheDeps) {
    this.#deps = deps;
  }

  async load(target: CacheTarget, refresh: boolean): Promise<EnvLoadResult> {
    const entry = this.#entries.get(target.key);
    if (!refresh && entry !== undefined) {
      const ttl = isFailure(entry.result) ? ENV_FAILURE_TTL_MS : ENV_TTL_MS;
      if (this.#deps.now() - entry.at < ttl) return entry.result;
      // 过期：立即给旧值，后台刷新，界面不等待
      return { ...entry.result, refreshing: this.#refresh(target) };
    }
    const fresh = await this.#refresh(target);
    // 第一次就失败：先把回退的结果给出去，后台再试一次（显式的“重新检测”不自动重试）
    if (!refresh && isFailure(fresh)) return { ...fresh, refreshing: this.#refresh(target) };
    return fresh;
  }

  /** 同一个键同时只解析一次；结果不会抛错 */
  #refresh(target: CacheTarget): Promise<EnvLoadResult> {
    const running = this.#inflight.get(target.key);
    if (running !== undefined) return running;
    const task = this.#deps
      .resolve(target)
      .catch((): EnvLoadResult => ({ env: {}, source: "fallback", ms: 0, reason: "failed" }))
      .then((result) => {
        this.#store(target.key, result);
        return result;
      })
      .finally(() => this.#inflight.delete(target.key));
    this.#inflight.set(target.key, task);
    return task;
  }

  #store(key: string, result: EnvLoadResult): void {
    const now = this.#deps.now();
    const old = this.#entries.get(key);
    if (isFailure(result) && old !== undefined && !isFailure(old.result)) {
      // 后台刷新失败：留着旧的好结果，下次请求时过一会儿再试
      old.at = now - ENV_TTL_MS + ENV_FAILURE_TTL_MS;
      return;
    }
    this.#entries.delete(key);
    this.#entries.set(key, { result, at: now });
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= MAX_ENTRIES) break;
      this.#entries.delete(oldest);
    }
  }
}
