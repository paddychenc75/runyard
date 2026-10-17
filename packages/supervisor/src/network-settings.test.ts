import { buildRunEnv } from "@runyard/core";
import { describe, expect, it } from "vitest";
import { runNetworkOf } from "./network-settings.ts";

// 设置里的镜像源和代理怎样进到依赖安装的环境里（规格 DESKTOP-SETTINGS-12、13）

const base = { PATH: "/usr/bin" };
const envOf = (network: Parameters<typeof runNetworkOf>[0]) =>
  buildRunEnv({ base, runDefaults: {}, network: runNetworkOf(network) });

describe("依赖与网络进入子进程环境", () => {
  it("[DESKTOP-SETTINGS-12] 指定了镜像源，安装用它（npm_config_registry）", () => {
    const env = envOf({ registry: "https://registry.npmmirror.com", noProxyLocal: true });
    expect(env.npm_config_registry).toBe("https://registry.npmmirror.com");
  });

  it("[DESKTOP-SETTINGS-13] 清空之后什么都不加，包管理器自己读本机 .npmrc", () => {
    const env = envOf({ noProxyLocal: true });
    expect(env.npm_config_registry).toBeUndefined();
    expect(env.https_proxy).toBeUndefined();
    expect(env.NO_PROXY).toBeUndefined();
  });

  it("指定了代理：http 和 https 都走它；勾着“本机服务不走代理”时 127.0.0.1 和 localhost 绕过", () => {
    const env = envOf({ proxy: "http://127.0.0.1:7890", noProxyLocal: true });
    expect(env.http_proxy).toBe("http://127.0.0.1:7890");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.no_proxy).toBe("127.0.0.1,localhost,::1");
  });

  it("取消“本机服务不走代理”时不写绕过清单", () => {
    const env = envOf({ proxy: "http://127.0.0.1:7890", noProxyLocal: false });
    expect(env.no_proxy).toBeUndefined();
  });

  it("没有指定代理时不动用户环境里原有的不走代理清单", () => {
    const env = buildRunEnv({
      base: { ...base, NO_PROXY: "corp.example" },
      runDefaults: {},
      network: runNetworkOf({ noProxyLocal: true }),
    });
    expect(env.NO_PROXY).toBe("corp.example");
  });
});
