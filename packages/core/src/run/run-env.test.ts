import { describe, expect, it } from "vitest";
import { buildRunEnv } from "./run-env.ts";

const base = { PATH: "/usr/bin", HOME: "/home/u" };

describe("子进程环境", () => {
  it("以登录环境为底，并合并平台的运行默认值（[TOOLCHAIN-DETECTION-03] 关闭 uv 与 Go 的自动下载）", () => {
    const env = buildRunEnv({
      base,
      runDefaults: { UV_PYTHON_DOWNLOADS: "never", GOTOOLCHAIN: "local" },
    });
    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/home/u" });
    expect(env.UV_PYTHON_DOWNLOADS).toBe("never");
    expect(env.GOTOOLCHAIN).toBe("local");
  });

  it("[RUN-LIFECYCLE-25] 登录环境里带着 ELECTRON_RUN_AS_NODE 也要去掉；运行器想设它也不行", () => {
    const withLeak = buildRunEnv({ base: { ...base, ELECTRON_RUN_AS_NODE: "1" }, runDefaults: {} });
    expect(withLeak).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
    const fromRunner = buildRunEnv({
      base,
      runDefaults: {},
      runnerEnv: { ELECTRON_RUN_AS_NODE: "1" },
    });
    expect(fromRunner).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  });

  it("Python 在非 UTF-8 的环境下也输出 UTF-8 且不缓冲；统一关遥测、强制颜色", () => {
    const env = buildRunEnv({ base: { ...base, PYTHONUTF8: "0", LANG: "C" }, runDefaults: {} });
    expect(env.PYTHONUTF8).toBe("1");
    expect(env.PYTHONUNBUFFERED).toBe("1");
    expect(env.NEXT_TELEMETRY_DISABLED).toBe("1");
    expect(env.FORCE_COLOR).toBe("1");
  });

  it("不设 CI=1", () => {
    expect(buildRunEnv({ base, runDefaults: {}, port: 7100 })).not.toHaveProperty("CI");
  });

  it("PORT 来自本次实际用的端口；运行器的 env 叠在全局环境之上", () => {
    const env = buildRunEnv({
      base,
      runDefaults: {},
      port: 7105,
      runnerEnv: { PYTHONDONTWRITEBYTECODE: "1", FORCE_COLOR: "0" },
    });
    expect(env.PORT).toBe("7105");
    expect(env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(env.FORCE_COLOR).toBe("0");
  });

  it("设置里的镜像源与代理写进环境；没设置就不出现", () => {
    const env = buildRunEnv({
      base,
      runDefaults: {},
      network: {
        npmRegistry: "https://registry.example.test/",
        proxy: { http: "http://127.0.0.1:8888", bypass: "127.0.0.1,localhost" },
      },
    });
    expect(env.npm_config_registry).toBe("https://registry.example.test/");
    expect(env.http_proxy).toBe("http://127.0.0.1:8888");
    expect(env.no_proxy).toBe("127.0.0.1,localhost");
    expect(buildRunEnv({ base, runDefaults: {} })).not.toHaveProperty("http_proxy");
  });

  it("不改传入的对象", () => {
    const input = { ...base, ELECTRON_RUN_AS_NODE: "1" };
    buildRunEnv({ base: input, runDefaults: {} });
    expect(input.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});
