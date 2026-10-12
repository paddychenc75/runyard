import { createServer, Socket } from "node:net";
import type { Platform, PortStatus } from "../platform.ts";
import { isLoopbackAddress, type SocketTable } from "./socket-table.ts";

// ports 的 POSIX 实现（技术设计 §4.5，规格 run/ports）。
// 探测只绑 127.0.0.1 和 ::1，绝不绑 0.0.0.0（绑通配地址在别的系统上会弹防火墙，且探测每次启动都做）。

const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
const CONNECT_TIMEOUT_MS = 300;

export type BindResult = "bound" | "in-use" | "denied" | "unavailable";

/** 试绑一个回环地址再立刻关掉。unavailable：本机没有这个地址族（如没开 IPv6） */
export function tryBind(port: number, host: string): Promise<BindResult> {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") return done("in-use");
      if (error.code === "EACCES") return done("denied");
      if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
        return done("unavailable");
      }
      return done("in-use");
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => done("bound"));
    });
  });
}

/** 连一下 127.0.0.1：连得上就有人在听。只在连接表读不出来时作后备 */
function canConnect(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = new Socket();
    const finish = (result: boolean) => {
      socket.destroy();
      done(result);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

export interface PosixPortsDeps {
  readonly table: SocketTable;
  readonly bind?: typeof tryBind;
}

export function createPosixPorts(deps: PosixPortsDeps): Platform["ports"] {
  const bind = deps.bind ?? tryBind;

  async function listeners(port: number, owners: boolean) {
    const rows = await deps.table.rows({ owners });
    return rows.filter((row) => row.state === "listen" && row.localPort === port);
  }

  return {
    async isFree(port): Promise<PortStatus> {
      let denied = false;
      for (const host of LOOPBACK_HOSTS) {
        const result = await bind(port, host);
        if (result === "in-use") return "in-use";
        if (result === "denied") denied = true;
      }
      if (denied) return "reserved";
      // 在 macOS 上，别的程序监听 0.0.0.0:<端口> 时，127.0.0.1:<端口> 仍然绑得上
      // （实测：技术设计 §4.5 “绑不上”的说法在 macOS 上不成立），所以再看一眼连接表，
      // 表读不出来就退回去连一下
      try {
        return (await listeners(port, false)).length > 0 ? "in-use" : "free";
      } catch {
        return (await canConnect(port)) ? "in-use" : "free";
      }
    },

    async occupant(port) {
      try {
        // 同一端口可能有多个监听者（如 127.0.0.1 和 ::1 各一个）；取第一个查得到进程的
        const found = (await listeners(port, true)).find((row) => row.pid !== undefined);
        if (found?.pid === undefined) return null;
        return { pid: found.pid, name: found.name ?? "" };
      } catch {
        return null;
      }
    },

    async connections(port) {
      const rows = await deps.table.rows({ owners: false });
      // 只数本端是这个端口的：回环连接在表里有两行（客户端一行、服务端一行），客户端那行的本端是临时端口
      return rows.filter((row) => row.state === "established" && row.localPort === port).length;
    },

    async loopbackOnly(port) {
      const found = await listeners(port, false);
      // 没有监听者时没有东西可以保证，按“不是只在回环上”处理
      return found.length > 0 && found.every((row) => isLoopbackAddress(row.localAddress));
    },
  };
}
