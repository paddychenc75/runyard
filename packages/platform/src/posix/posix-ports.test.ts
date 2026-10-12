import { describe, expect, it } from "vitest";
import { type BindResult, createPosixPorts } from "./posix-ports.ts";
import type { SocketRow, SocketTable } from "./socket-table.ts";

const table = (rows: SocketRow[] | Error): SocketTable => ({
  rows: async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  },
});
const listener = (
  localAddress: string,
  localPort: number,
  extra: Partial<SocketRow> = {},
): SocketRow => ({
  state: "listen",
  localAddress,
  localPort,
  ...extra,
});
const ports = (rows: SocketRow[] | Error, results: Record<string, BindResult> = {}) => {
  const hosts: string[] = [];
  const api = createPosixPorts({
    table: table(rows),
    bind: async (_port, host) => {
      hosts.push(host);
      return results[host] ?? "bound";
    },
  });
  return { api, hosts };
};

describe("ports.isFree 的判断规则（用假绑定和假连接表）", () => {
  it("只试 127.0.0.1 和 ::1，各一次", async () => {
    const { api, hosts } = ports([]);
    expect(await api.isFree(7100)).toBe("free");
    expect(hosts).toEqual(["127.0.0.1", "::1"]);
  });

  it("任一地址已被占用：in-use，不再往下试", async () => {
    const { api, hosts } = ports([], { "127.0.0.1": "in-use" });
    expect(await api.isFree(7100)).toBe("in-use");
    expect(hosts).toEqual(["127.0.0.1"]);
  });

  it("绑定报无权限：reserved", async () => {
    expect(await ports([], { "127.0.0.1": "denied" }).api.isFree(80)).toBe("reserved");
  });

  it("本机没有 IPv6 回环：只看 127.0.0.1", async () => {
    expect(await ports([], { "::1": "unavailable" }).api.isFree(7100)).toBe("free");
  });

  it("[RUN-PORTS-11] 绑得上但连接表里有监听者（macOS 上 0.0.0.0 的占用者就是这样）：in-use", async () => {
    expect(await ports([listener("*", 7100)]).api.isFree(7100)).toBe("in-use");
    expect(await ports([listener("*", 7101)]).api.isFree(7100)).toBe("free");
  });
});

describe("ports.occupant / connections / loopbackOnly 的判断规则", () => {
  it("occupant：取查得到进程的那个监听者；都没有进程信息时返回 null；表读不出来时返回 null", async () => {
    const rows = [listener("::1", 7100), listener("127.0.0.1", 7100, { pid: 42, name: "node" })];
    expect(await ports(rows).api.occupant(7100)).toEqual({ pid: 42, name: "node" });
    expect(await ports([listener("*", 7100)]).api.occupant(7100)).toBeNull();
    expect(await ports(new Error("netstat failed")).api.occupant(7100)).toBeNull();
  });

  it("connections：只数本端是这个端口、已建立的连接", async () => {
    const established = (localPort: number): SocketRow => ({
      state: "established",
      localAddress: "127.0.0.1",
      localPort,
    });
    const rows = [established(7100), established(7100), established(50000), listener("*", 7100)];
    expect(await ports(rows).api.connections(7100)).toBe(2);
  });

  it("loopbackOnly：监听者全在回环上才是 true；有任何通配或外部地址、或根本没有监听者都是 false", async () => {
    expect(await ports([listener("127.0.0.1", 7100)]).api.loopbackOnly(7100)).toBe(true);
    expect(
      await ports([listener("127.0.0.1", 7100), listener("::1", 7100)]).api.loopbackOnly(7100),
    ).toBe(true);
    expect(
      await ports([listener("127.0.0.1", 7100), listener("*", 7100)]).api.loopbackOnly(7100),
    ).toBe(false);
    expect(await ports([listener("0.0.0.0", 7100)]).api.loopbackOnly(7100)).toBe(false);
    expect(await ports([]).api.loopbackOnly(7100)).toBe(false);
  });
});
