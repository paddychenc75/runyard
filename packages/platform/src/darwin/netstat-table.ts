import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { platformError } from "../platform-error.ts";
import type { SocketRow, SocketTable } from "../posix/socket-table.ts";

// macOS 读连接表用 `netstat -anv -p tcp`：不用原生模块，也不用 lsof；
// -v 多一列 “进程名:pid”（套接字最后一次被谁用），连别的用户的套接字也列得出来。
// 代价（负责人的 Mac 上量的）：一次约 10 毫秒；再查进程全名多一次 ps，约 3 毫秒。
// 查不到进程（列里没有）时 occupant 返回 null。
const NETSTAT = "/usr/sbin/netstat";
const PS = "/bin/ps";
const execFileAsync = promisify(execFile);

// 例：tcp4  0  0  127.0.0.1.7100  *.*  LISTEN  0  0  131072  131072  node:61827  00100 ...
// 进程名里可能有空格（“Microsoft Edge H:5862”），所以用“后面跟着 5 位十六进制状态”来定位这一列
const ROW =
  /^(tcp[46]*)\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)\s+\d+\s+\d+\s+\d+\s+\d+\s+(.*?):(\d+)\s+[0-9a-f]{5}\s/;

/** `127.0.0.1.7100`、`::1.7100`、`*.7100` 拆成地址和端口：端口是最后一个点之后的部分 */
export function splitAddress(text: string): { address: string; port: number } | null {
  const dot = text.lastIndexOf(".");
  if (dot === -1) return null;
  const port = Number(text.slice(dot + 1));
  if (!Number.isInteger(port)) return null;
  return { address: text.slice(0, dot), port };
}

export function parseNetstat(output: string): SocketRow[] {
  const rows: SocketRow[] = [];
  for (const line of output.split("\n")) {
    const match = ROW.exec(line);
    if (!match) continue;
    const local = splitAddress(match[2] ?? "");
    if (!local) continue;
    const state =
      match[4] === "LISTEN" ? "listen" : match[4] === "ESTABLISHED" ? "established" : "other";
    const pid = Number(match[6]);
    rows.push({
      state,
      localAddress: local.address,
      localPort: local.port,
      // pid 0 表示套接字已不属于任何进程
      ...(pid > 0 ? { pid, name: (match[5] ?? "").trim() } : {}),
    });
  }
  return rows;
}

async function fullName(pid: number, fallback: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(PS, ["-o", "comm=", "-p", String(pid)], {
      env: { ...process.env, LC_ALL: "C" },
    });
    const name = basename(stdout.trim());
    return name === "" ? fallback : name;
  } catch {
    return fallback;
  }
}

export function createNetstatTable(): SocketTable {
  return {
    async rows({ owners }) {
      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(NETSTAT, ["-anv", "-p", "tcp"], {
          env: { ...process.env, LC_ALL: "C" },
          maxBuffer: 64 * 1024 * 1024,
        }));
      } catch (error) {
        throw platformError("INTERNAL", {}, `netstat failed: ${String(error)}`);
      }
      const rows = parseNetstat(stdout);
      if (!owners) return rows;
      return Promise.all(
        rows.map(async (row) =>
          row.state === "listen" && row.pid !== undefined
            ? { ...row, name: await fullName(row.pid, row.name ?? "") }
            : row,
        ),
      );
    },
  };
}
