import { describe, expect, it } from "vitest";
import { parseNetstat, splitAddress } from "./netstat-table.ts";

// macOS `netstat -anv -p tcp` 的真实行（节选）
const OUTPUT = [
  "Active Internet connections (including servers)",
  "Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options           gencnt    flags   flags1 usecnt rtncnt fltrs",
  "tcp4       0      0  *.59105                *.*                    LISTEN                 0            0  131072  131072             node:61827  00100 00000106 0000000000cc553e 00000001 00000800      1      0 000000",
  "tcp6       0      0  ::1.61395              *.*                    LISTEN                 0            0  131072  131072             node:24050  00100 00000106 0000000000a4b71d 00000001 00000800      1      0 000000",
  "tcp4       0      0  127.0.0.1.8234         127.0.0.1.59121        ESTABLISHED         3314           39  406784  146988            Surge:1287   00102 00000004 0000000000cc5656 00080081 01000800      1      0 000000",
  "tcp4       0      0  127.0.0.1.59058        127.0.0.1.8234         ESTABLISHED        16614         3266  400320  146988      Code Helper:27884  00102 00000008 0000000000cc52cc 00000080 04000900      1      0 000000",
  "tcp4       0      0  127.0.0.1.7100         127.0.0.1.50000        TIME_WAIT              0            0  131072  131072                  :0  00100 00000000 0000000000000000 00000000 00000000      1      0 000000",
].join("\n");

describe("splitAddress", () => {
  it("端口是最后一个点之后的部分，IPv6 也一样", () => {
    expect(splitAddress("127.0.0.1.7100")).toEqual({ address: "127.0.0.1", port: 7100 });
    expect(splitAddress("::1.61395")).toEqual({ address: "::1", port: 61395 });
    expect(splitAddress("*.59105")).toEqual({ address: "*", port: 59105 });
    expect(splitAddress("nodot")).toBeNull();
  });
});

describe("parseNetstat", () => {
  it("解析监听和已建立的连接，带进程号和（被截断的）进程名；进程名里的空格不拆开", () => {
    expect(parseNetstat(OUTPUT)).toEqual([
      { state: "listen", localAddress: "*", localPort: 59105, pid: 61827, name: "node" },
      { state: "listen", localAddress: "::1", localPort: 61395, pid: 24050, name: "node" },
      {
        state: "established",
        localAddress: "127.0.0.1",
        localPort: 8234,
        pid: 1287,
        name: "Surge",
      },
      {
        state: "established",
        localAddress: "127.0.0.1",
        localPort: 59058,
        pid: 27884,
        name: "Code Helper",
      },
      { state: "other", localAddress: "127.0.0.1", localPort: 7100 },
    ]);
  });
});
