import type { Env } from "@runyard/platform";

// 子进程的环境（技术设计 §4.5“环境变量”，规格 TOOLCHAIN-DETECTION-03、RUN-LIFECYCLE-25）。
// 以用户登录环境为底，依次叠上：平台的运行默认值（关掉 uv、Go 的自动下载）、统一的固定项、
// 设置里的镜像与代理、PORT、运行器自己的 env。最后删掉管理进程自己的 ELECTRON_RUN_AS_NODE：
// 漏了它，用户项目里的 Electron 程序会被当成 Node 跑。不设 CI=1（pnpm 会据此改变默认行为）。

/** 设置里“网络”一组的取值。设置的规格还没批准，这里只收运行时用得到的几项 */
export type RunNetworkSettings = {
  /** npm 镜像源 */
  readonly npmRegistry?: string;
  readonly proxy?: {
    readonly http?: string;
    readonly https?: string;
    /** 逗号分隔的不走代理清单 */
    readonly bypass?: string;
  };
};

export type RunEnvInput = {
  /** 登录环境（`platform.env.load()` 的 env） */
  readonly base: Env;
  /** `platform.env.runDefaults()` */
  readonly runDefaults: Env;
  readonly runnerEnv?: Readonly<Record<string, string>>;
  readonly port?: number;
  readonly network?: RunNetworkSettings;
};

// 所有系统都加：Python 在非 UTF-8 的环境下写中文会崩（0008）；不缓冲，强杀时才不丢行
const FIXED: Readonly<Record<string, string>> = {
  PYTHONUTF8: "1",
  PYTHONUNBUFFERED: "1",
  FORCE_COLOR: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NUXT_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
  NO_UPDATE_NOTIFIER: "1",
};

function networkEnv(network: RunNetworkSettings | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  if (network?.npmRegistry !== undefined) env.npm_config_registry = network.npmRegistry;
  const { http, https, bypass } = network?.proxy ?? {};
  if (http !== undefined) {
    env.http_proxy = http;
    env.HTTP_PROXY = http;
  }
  if (https !== undefined) {
    env.https_proxy = https;
    env.HTTPS_PROXY = https;
  }
  if (bypass !== undefined) {
    env.no_proxy = bypass;
    env.NO_PROXY = bypass;
  }
  return env;
}

export function buildRunEnv(input: RunEnvInput): Env {
  const env: Record<string, string> = {
    ...input.base,
    ...input.runDefaults,
    ...FIXED,
    ...networkEnv(input.network),
    ...(input.port === undefined ? {} : { PORT: String(input.port) }),
    ...input.runnerEnv,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
