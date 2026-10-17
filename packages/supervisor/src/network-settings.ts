import type { RunNetworkSettings } from "@runyard/core";
import type { Settings } from "@runyard/protocol";

// 设置里的“依赖与网络”变成子进程的环境（规格 DESKTOP-SETTINGS-12、13）：指定了镜像源或代理，
// 之后的依赖安装和运行都带上；没指定（或清空）就什么都不加，包管理器自己读本机的 .npmrc 和环境变量。
// “检测本机服务时不走代理”只在我们自己设了代理时才写不走代理的清单：没设代理时写了会盖掉用户环境里原有的清单。
const LOCAL_HOSTS = "127.0.0.1,localhost,::1";

export function runNetworkOf(network: Settings["network"]): RunNetworkSettings {
  const { registry, proxy, noProxyLocal } = network;
  return {
    ...(registry === undefined ? {} : { npmRegistry: registry }),
    ...(proxy === undefined
      ? {}
      : {
          proxy: {
            http: proxy,
            https: proxy,
            ...(noProxyLocal ? { bypass: LOCAL_HOSTS } : {}),
          },
        }),
  };
}
