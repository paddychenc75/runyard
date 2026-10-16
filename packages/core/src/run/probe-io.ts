import { Agent, request } from "node:http";
import { connect } from "node:net";

// 就绪探测真正碰网络的两个动作。放在一个文件里，探测的逻辑（readiness-probe.ts）才能在单元测试里换成假的。
// 只连 127.0.0.1，不读任何代理设置（规格 RUN-PORTS-13）：
// 用自己新建的 Agent，不经 http.globalAgent；Node 的环境变量代理开关（NODE_USE_ENV_PROXY）只作用于全局 Agent。

export type ProbeIo = {
  /** 收到 HTTP 响应就返回状态码；连不上、超时、连接被重置返回 null */
  httpStatus(port: number, path: string): Promise<number | null>;
  /** 端口能连上 */
  tcpOpen(port: number): Promise<boolean>;
};

export const PROBE_TIMEOUT_MS = 2000;

export const nodeProbeIo: ProbeIo = {
  httpStatus(port, path) {
    return new Promise((resolve) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path,
          method: "GET",
          agent: new Agent({ keepAlive: false }),
          timeout: PROBE_TIMEOUT_MS,
        },
        (response) => {
          response.resume();
          response.destroy();
          resolve(response.statusCode ?? null);
        },
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
      req.end();
    });
  },
  tcpOpen(port) {
    return new Promise((resolve) => {
      const socket = connect({ host: "127.0.0.1", port, timeout: PROBE_TIMEOUT_MS });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => resolve(false));
    });
  },
};
