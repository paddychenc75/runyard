// 本机 TCP 连接表的读取方式。ports 的判断（谁在监听、有几条连接、是否只在回环地址上）
// 只依赖这个接口；各系统只负责“怎么读”：macOS 用 netstat，Linux 读 /proc/net/tcp。

export interface SocketRow {
  readonly state: "listen" | "established" | "other";
  /** 本端地址的写法由系统决定（`127.0.0.1`、`::1`、`*`、`0.0.0.0`、`::`）；判断请用 isLoopbackAddress */
  readonly localAddress: string;
  readonly localPort: number;
  /** 持有这个套接字的进程；查不到时没有 */
  readonly pid?: number;
  readonly name?: string;
}

export interface SocketTable {
  /** owners 为 false 时不必查进程，可以更快；只有 occupant 需要进程 */
  rows(opts: { owners: boolean }): Promise<SocketRow[]>;
}

export function isLoopbackAddress(address: string): boolean {
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}
