import {
  type AbsPath,
  type EnvLoadResult,
  joinPath,
  type Platform,
  posixRelPath,
} from "@runyard/platform";
import {
  isToolchainCacheFresh,
  type Notice,
  type Requires,
  TOOLCHAIN_FILE_VERSION,
  type ToolCheck,
  type ToolchainCacheEntry,
  type ToolchainFile,
  type ToolDefinition,
} from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";
import { type DetectDeps, detectTool } from "./detect-tool.ts";
import {
  evaluateRequirements,
  type ToolchainEvaluation,
  type ToolObservation,
  toolsToDetect,
} from "./evaluate-requirements.ts";

// 工具链检测的门面（技术设计 §4.8；规格 toolchain/detection）。
// 只检测请求里用得到的工具（-01）；cachedOnly 只读缓存、不起任何进程（-02）；其余每次都实时找、实时跑版本命令，
// 所以往 PATH 已有的目录装了新工具不用重新解析环境（-19）。
// 登录环境本身的缓存、后台刷新、超时降级在平台层（env.load）；这里靠返回值里的 refreshing 知道刷新何时完成，
// 完成后重新检测、更新缓存并发 toolchain.changed（-18、-15）。
// 缓存只产出结构（ToolchainFile），state/toolchain.json 的读写归 supervisor。

/** 这些文件会让版本垫片按项目选版本，所以有它们的项目单独缓存（技术设计 §4.8） */
const VERSION_FILES = [
  ".node-version",
  ".nvmrc",
  ".tool-versions",
  "mise.toml",
  ".python-version",
  "package.json",
];
const GLOBAL_KEY = "global";

export interface ToolchainRequest {
  /** 模板的 requires；{} 表示不依赖任何工具，什么也不检测 */
  readonly requires: Requires;
  /** 项目文件夹：版本命令和读取环境都以它为工作目录 */
  readonly cwd?: AbsPath;
  /** 只读缓存，不触发任何检测；缓存里没有的工具状态是 unknown */
  readonly cachedOnly?: boolean;
}

export interface ToolchainResult extends ToolchainEvaluation {
  /** 这次检测用的环境来源；cachedOnly 时没有 */
  readonly envSource?: EnvLoadResult["source"];
}

export interface ToolchainServiceDeps {
  readonly platform: Platform;
  readonly clock: RunClock;
  /** 应用认识的全部工具（工具定义由模板那一侧提供） */
  readonly definitions: ReadonlyMap<string, ToolDefinition>;
  /** 设置里手动指定的路径（工具名到绝对路径）；每次检测时现读，改了设置后重新检测即生效 */
  readonly toolPaths: () => Readonly<Record<string, string>>;
  /** 后台刷新完成、结果可能变了：supervisor 据此发 toolchain.changed */
  readonly onChanged: () => void;
  /** 启动时读到的 state/toolchain.json，没有或坏了就不传 */
  readonly initialCache?: ToolchainFile;
  /** 缓存变了：supervisor 把它写回 state/toolchain.json */
  readonly onCacheChange?: (file: ToolchainFile) => void;
  readonly versionTimeoutMs?: number;
}

function envNotice(loaded: EnvLoadResult): Notice | null {
  if (loaded.source === "fallback") {
    return { code: "ENV_UNRESOLVED", params: { reason: loaded.reason ?? "failed" } };
  }
  if (loaded.source === "login-shell-degraded") return { code: "ENV_DEGRADED", params: {} };
  // path-only 没有对应的提示码，规格也没有要求提示
  return null;
}

function observationOf(check: ToolCheck): ToolObservation {
  if (check.status === "missing") return { tool: check.tool, state: "missing" };
  if (check.version === undefined || check.path === undefined) {
    return { tool: check.tool, state: "unknown" };
  }
  return { tool: check.tool, state: "found", path: check.path, version: check.version };
}

export class ToolchainService {
  readonly #deps: ToolchainServiceDeps;
  readonly #entries = new Map<string, ToolchainCacheEntry>();
  readonly #watched = new WeakSet<Promise<EnvLoadResult>>();

  constructor(deps: ToolchainServiceDeps) {
    this.#deps = deps;
    for (const [key, entry] of Object.entries(deps.initialCache?.entries ?? {})) {
      this.#entries.set(key, entry);
    }
  }

  /** 当前缓存的结构，交给 supervisor 写 state/toolchain.json */
  snapshot(): ToolchainFile {
    return { formatVersion: TOOLCHAIN_FILE_VERSION, entries: Object.fromEntries(this.#entries) };
  }

  /** 缓存里某个项目（没有版本文件的项目用全局那份）的条目是否还在有效期内；没有条目返回 null */
  async isCacheFresh(cwd?: AbsPath): Promise<boolean | null> {
    const entry = this.#entries.get(await this.#keyFor(cwd));
    return entry === undefined ? null : isToolchainCacheFresh(entry, this.#deps.clock.now());
  }

  async check(request: ToolchainRequest): Promise<ToolchainResult> {
    if (request.cachedOnly === true) return this.#fromCache(request);
    if (Object.keys(request.requires).length === 0) {
      return { tools: [], errors: [], notices: [], fallbacks: [] };
    }
    const loaded = await this.#deps.platform.env.load(
      request.cwd === undefined ? undefined : { cwd: request.cwd },
    );
    return this.#detectWith(request, loaded);
  }

  /** 检测全部已知工具，用工具定义里的 supported 当范围 */
  doctor(cwd?: AbsPath): Promise<ToolchainResult> {
    return this.check({
      requires: this.#supportedRequires(),
      ...(cwd === undefined ? {} : { cwd }),
    });
  }

  /** 重新检测：清空缓存，重新解析环境并重新查找（-12）；返回新结果 */
  async recheck(cwd?: AbsPath): Promise<ToolchainResult> {
    this.#entries.clear();
    this.#emitCache();
    const loaded = await this.#deps.platform.env.load({
      refresh: true,
      ...(cwd === undefined ? {} : { cwd }),
    });
    return this.#detectWith(
      { requires: this.#supportedRequires(), ...(cwd === undefined ? {} : { cwd }) },
      loaded,
    );
  }

  /** 应用启动时调用：在后台刷新环境和缓存，不等待；完成后发 toolchain.changed（界面先用旧值） */
  warmUp(cwd?: AbsPath): void {
    void this.recheck(cwd)
      .then(() => this.#deps.onChanged())
      .catch(() => undefined);
  }

  #supportedRequires(): Requires {
    const requires: Requires = {};
    for (const [id, definition] of this.#deps.definitions) {
      requires[id] = { version: definition.supported };
    }
    return requires;
  }

  async #keyFor(cwd: AbsPath | undefined): Promise<string> {
    if (cwd === undefined) return GLOBAL_KEY;
    const present = await Promise.all(
      VERSION_FILES.map((name) => this.#deps.platform.fs.exists(joinPath(cwd, posixRelPath(name)))),
    );
    return present.some(Boolean) ? `project:${cwd}` : GLOBAL_KEY;
  }

  // cachedOnly：不起进程，不读环境。过期的条目照样给（-18：先给旧值），不在这里刷新
  async #fromCache(request: ToolchainRequest): Promise<ToolchainResult> {
    const key = await this.#keyFor(request.cwd);
    const entry = this.#entries.get(key) ?? this.#entries.get(GLOBAL_KEY);
    const observations = new Map<string, ToolObservation>();
    for (const check of entry?.tools ?? []) observations.set(check.tool, observationOf(check));
    return evaluateRequirements(request.requires, observations);
  }

  async #detectWith(request: ToolchainRequest, loaded: EnvLoadResult): Promise<ToolchainResult> {
    const { platform } = this.#deps;
    const cwd = request.cwd ?? platform.paths.home;
    const detectDeps: DetectDeps = {
      platform,
      clock: this.#deps.clock,
      versionTimeoutMs: this.#deps.versionTimeoutMs,
    };
    // 版本命令也关掉 uv 和 Go 的自动下载，免得 go version 为了满足 go.mod 去下载工具链
    const env = { ...loaded.env, ...platform.env.runDefaults() };
    const manual = this.#deps.toolPaths();
    const probes = await Promise.all(
      toolsToDetect(request.requires).map((tool): Promise<ToolObservation> => {
        const definition = this.#deps.definitions.get(tool);
        if (definition === undefined) return Promise.resolve({ tool, state: "missing" });
        return detectTool(detectDeps, definition, {
          cwd,
          env,
          useKnownLocations: loaded.source === "fallback",
          ...(manual[tool] === undefined ? {} : { manualPath: manual[tool] }),
        });
      }),
    );
    const evaluation = evaluateRequirements(
      request.requires,
      new Map(probes.map((probe) => [probe.tool, probe])),
      loaded.source,
    );
    await this.#store(request.cwd, evaluation.tools);
    this.#watchRefresh(request, loaded);
    const notice = envNotice(loaded);
    return {
      ...evaluation,
      notices: notice === null ? evaluation.notices : [notice, ...evaluation.notices],
      envSource: loaded.source,
    };
  }

  // 旧值或回退值在后台刷新：完成后用新环境重新检测，更新缓存，再通知（-15、-18）
  #watchRefresh(request: ToolchainRequest, loaded: EnvLoadResult): void {
    const refreshing = loaded.refreshing;
    if (refreshing === undefined || this.#watched.has(refreshing)) return;
    this.#watched.add(refreshing);
    void refreshing
      .then((fresh) => this.#detectWith(request, fresh))
      .then(() => this.#deps.onChanged())
      .catch(() => undefined);
  }

  async #store(cwd: AbsPath | undefined, checks: ToolCheck[]): Promise<void> {
    const key = await this.#keyFor(cwd);
    const old = this.#entries.get(key);
    const merged = new Map((old?.tools ?? []).map((check) => [check.tool, check]));
    for (const check of checks) if (check.status !== "unknown") merged.set(check.tool, check);
    this.#entries.set(key, { checkedAt: this.#deps.clock.now(), tools: [...merged.values()] });
    this.#emitCache();
  }

  #emitCache(): void {
    this.#deps.onCacheChange?.(this.snapshot());
  }
}
