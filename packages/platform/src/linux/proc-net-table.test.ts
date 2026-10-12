import { describe, expect, it } from "vitest";
import { isLoopbackAddress } from "../posix/socket-table.ts";
import { decodeAddress, parseProcNetTcp } from "./proc-net-table.ts";

// 真实 /proc/net/tcp 的格式：地址按 32 位字小端写
const HEADER =
  "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode";
const TCP = [
  HEADER,
  "   0: 0100007F:1BBC 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 11111 1 0000000000000000 100 0 0 10 0",
  "   1: 00000000:1BBD 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 22222 1 0000000000000000 100 0 0 10 0",
  "   2: 0100007F:1BBC 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1000        0 33333 1 0000000000000000 100 0 0 10 0",
  "   3: 0100007F:C350 0100007F:1BBC 06 00000000:00000000 00:00000000 00000000  1000        0 0 1 0000000000000000 100 0 0 10 0",
].join("\n");
const TCP6 = [
  HEADER,
  "   0: 00000000000000000000000001000000:1BBE 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 44444 1 0000000000000000 100 0 0 10 0",
].join("\n");

describe("decodeAddress", () => {
  it("IPv4 小端", () => {
    expect(decodeAddress("0100007F")).toBe("127.0.0.1");
    expect(decodeAddress("00000000")).toBe("0.0.0.0");
  });

  it("IPv6 的回环、通配和映射的 IPv4", () => {
    expect(decodeAddress("00000000000000000000000001000000")).toBe("::1");
    expect(decodeAddress("00000000000000000000000000000000")).toBe("::");
    expect(decodeAddress("0000000000000000FFFF00000100007F")).toBe("::ffff:127.0.0.1");
  });
});

describe("parseProcNetTcp", () => {
  it("解析状态、本端地址和端口、inode", () => {
    expect(parseProcNetTcp(TCP)).toEqual([
      { state: "listen", localAddress: "127.0.0.1", localPort: 0x1bbc, inode: "11111" },
      { state: "listen", localAddress: "0.0.0.0", localPort: 0x1bbd, inode: "22222" },
      { state: "established", localAddress: "127.0.0.1", localPort: 0x1bbc, inode: "33333" },
      { state: "other", localAddress: "127.0.0.1", localPort: 0xc350, inode: "0" },
    ]);
    expect(parseProcNetTcp(TCP6)).toEqual([
      { state: "listen", localAddress: "::1", localPort: 0x1bbe, inode: "44444" },
    ]);
  });

  it("回环和通配分得清", () => {
    expect(["127.0.0.1", "::1", "::ffff:127.0.0.1"].every(isLoopbackAddress)).toBe(true);
    expect(["0.0.0.0", "::", "*", "192.168.1.5"].some(isLoopbackAddress)).toBe(false);
  });
});
