import type {
  AbsPath,
  Env,
  EnvLoadResult,
  ShellInfo,
  ToolCandidate,
  ToolId,
} from "@runyard/platform";
import { absPath } from "@runyard/platform";
import type { FakeProcesses } from "./fake-processes.ts";
import type { SpawnSpec } from "./process-behavior.ts";

const DEFAULT_ENV: Env = { PATH: "/usr/bin:/bin" };

// 假的环境解析：load 返回剧本里的结果，并记下每次调用的参数。
// 成功、降级（login-shell-degraded）、回退（fallback，对应解析超时）都靠 set / fallback / degraded 设定；
// 要测“调用方在解析期间不被阻塞”就用 hold，由测试决定何时放行。
export class FakeEnv {
  #result: EnvLoadResult = { env: DEFAULT_ENV, source: "login-shell", ms: 0 };
  #held: ((result: EnvLoadResult) => void)[] | null = null;
  runDefaults: Record<string, string> = {};
  readonly loadCalls: { refresh?: boolean; cwd?: AbsPath }[] = [];

  set(result: Partial<EnvLoadResult>): void {
    this.#result = { ...this.#result, ...result };
  }

  /** 只读到非交互环境 */
  degraded(env?: Env): void {
    this.set({ source: "login-shell-degraded", ...(env === undefined ? {} : { env }) });
  }

  /** 解析超时（硬超时 10 秒）后的结果：来源是 fallback，env 是常见目录扫描的 */
  fallback(env?: Env): void {
    this.set({ source: "fallback", ms: 10_000, ...(env === undefined ? {} : { env }) });
  }

  /** 之后的 load 一直不返回，直到 release；返回的函数放行所有等待者 */
  hold(): { release(result?: Partial<EnvLoadResult>): void } {
    this.#held = [];
    return {
      release: (result) => {
        if (result !== undefined) this.set(result);
        const waiting = this.#held ?? [];
        this.#held = null;
        for (const resolve of waiting) resolve(this.#result);
      },
    };
  }

  load(opts: { refresh?: boolean; cwd?: AbsPath } = {}): Promise<EnvLoadResult> {
    this.loadCalls.push(opts);
    if (this.#held === null) return Promise.resolve(this.#result);
    return new Promise((resolve) => this.#held?.push(resolve));
  }
}

export interface FakeToolSpec {
  /** 版本号；按工作目录不同可以用函数（版本垫片按目录选版本） */
  readonly version: string | ((cwd: AbsPath) => string);
  /** 默认 /fake/bin/<tool> */
  readonly path?: AbsPath;
  /** 默认 env-path；known-location 表示只在固定的常见位置找到 */
  readonly origin?: ToolCandidate["origin"];
  /** 只有这个环境下才找得到（例如只在登录 shell 的环境里有 nvm 装的 Node） */
  readonly visibleWhen?: (env: Env) => boolean;
  /** 版本命令的原始输出，默认按该工具的真实格式从 version 生成 */
  readonly versionOutput?: string;
  /** 文件在，但版本命令执行失败（退出码 1） */
  readonly versionCommandFails?: boolean;
}

function versionArgs(tool: ToolId): string[] {
  return tool === "go" ? ["version"] : ["--version"];
}

function defaultOutput(tool: ToolId, version: string): string {
  if (tool === "go") return `go version go${version} darwin/arm64\n`;
  if (tool === "node") return `v${version}\n`;
  return `${version}\n`;
}

// 假的工具表：登记一个工具，既让 which / candidates 找得到，也让“执行版本命令”这一步得到剧本里的输出。
// “过旧、过高”不是这里判断的，只是版本号不同；判断归 core。
export class FakeTools {
  readonly #processes: FakeProcesses;
  readonly #installed = new Map<ToolId, FakeToolSpec & { path: AbsPath }>();
  packageManagers: string[] = ["npm"];
  shells: ShellInfo[] = [{ path: absPath("/bin/zsh"), name: "zsh" }];

  constructor(processes: FakeProcesses) {
    this.#processes = processes;
  }

  install(tool: ToolId, spec: FakeToolSpec): AbsPath {
    const path = spec.path ?? absPath(`/fake/bin/${tool}`);
    this.#installed.set(tool, { ...spec, path });
    this.#processes.when([path, ...versionArgs(tool)], (call: SpawnSpec) => {
      const version = typeof spec.version === "function" ? spec.version(call.cwd) : spec.version;
      if (spec.versionCommandFails === true) {
        return {
          output: [{ atMs: 0, stream: "stderr", data: `${tool}: command failed\n` }],
          exit: { afterMs: 0, code: 1 },
        };
      }
      return {
        output: [
          { atMs: 0, stream: "stdout", data: spec.versionOutput ?? defaultOutput(tool, version) },
        ],
        exit: { afterMs: 0, code: 0 },
      };
    });
    return path;
  }

  /** 本机没有这个工具 */
  missing(tool: ToolId): void {
    this.#installed.delete(tool);
  }

  which(name: string, env: Env): AbsPath | null {
    const found = this.#installed.get(name);
    if (found === undefined || found.origin === "known-location") return null;
    return found.visibleWhen?.(env) === false ? null : found.path;
  }

  candidates(tool: ToolId, env: Env): ToolCandidate[] {
    const found = this.#installed.get(tool);
    if (found === undefined || found.visibleWhen?.(env) === false) return [];
    return [{ path: found.path, origin: found.origin ?? "env-path" }];
  }
}
