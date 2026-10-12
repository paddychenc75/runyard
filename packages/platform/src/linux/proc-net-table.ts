import { readdir, readFile, readlink } from "node:fs/promises";
import type { SocketRow, SocketTable } from "../posix/socket-table.ts";

// Linux 读连接表：/proc/net/tcp 和 tcp6 给出套接字和 inode，/proc/<pid>/fd/ 里的
// `socket:[inode]` 链接把 inode 对到进程。别的用户的进程读不到 fd，对应的行没有 pid（occupant 返回 null）。

const STATES: Record<string, SocketRow["state"]> = { "0A": "listen", "01": "established" };

/** 内核按 32 位字、小端写地址：IPv4 是 `0100007F`，IPv6 是四个这样的字 */
export function decodeAddress(hex: string): string {
  const words = hex.match(/.{8}/g) ?? [];
  const bytes = words.flatMap((word) =>
    (word.match(/.{2}/g) ?? []).reverse().map((byte) => Number.parseInt(byte, 16)),
  );
  if (bytes.length === 4) return bytes.join(".");
  if (bytes.length !== 16) return hex;
  if (bytes.every((byte) => byte === 0)) return "::";
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return "::1";
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 255 && bytes[11] === 255) {
    return `::ffff:${bytes.slice(12).join(".")}`;
  }
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16));
  }
  return groups.join(":");
}

export interface RawSocket extends SocketRow {
  readonly inode: string;
}

export function parseProcNetTcp(text: string): RawSocket[] {
  const rows: RawSocket[] = [];
  for (const line of text.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    // sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode ...
    const [, local, , st, , , , , , inode] = cols;
    if (!local || !st || !inode) continue;
    const [addr, port] = local.split(":");
    if (!addr || !port) continue;
    rows.push({
      state: STATES[st] ?? "other",
      localAddress: decodeAddress(addr),
      localPort: Number.parseInt(port, 16),
      inode,
    });
  }
  return rows;
}

async function socketOwners(): Promise<Map<string, { pid: number; name: string }>> {
  const owners = new Map<string, { pid: number; name: string }>();
  for (const entry of await readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const fds = await readdir(`/proc/${pid}/fd`);
      for (const fd of fds) {
        const link = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => "");
        const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
        if (inode && !owners.has(inode)) {
          const name = (await readFile(`/proc/${pid}/comm`, "utf8").catch(() => "")).trim();
          owners.set(inode, { pid, name });
        }
      }
    } catch {
      // 别的用户的进程或刚退出的进程：读不到就没有 pid
    }
  }
  return owners;
}

export function createProcNetTable(): SocketTable {
  return {
    async rows({ owners }) {
      const raw: RawSocket[] = [];
      for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
        raw.push(...parseProcNetTcp(await readFile(file, "utf8").catch(() => "")));
      }
      const byInode = owners ? await socketOwners() : new Map();
      return raw.map(({ inode, ...row }) => ({ ...row, ...(byInode.get(inode) ?? {}) }));
    },
  };
}
