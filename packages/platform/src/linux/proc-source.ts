import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import type { ProcessEntry, ProcessSource } from "../posix/process-source.ts";

// Linux 读 /proc/<pid>/stat，不起子进程；一次读一个小文件。
// 第 22 项 starttime 是开机后的时钟节拍数。节拍频率取常见的 100 Hz（不调 sysconf）；
// 就算实际不同，同一台机器上同一个进程总是同一个值，而这个值只用来比较。

const TICK_MS = 10;

interface StatFields {
  readonly pgid: number;
  readonly startTime: number;
  /** 第 7 项 tty_nr：控制终端的设备号，0 是没有 */
  readonly tty: number;
}

/** /proc/<pid>/stat 的一行。进程名（第 2 项）可能含空格和括号，所以从最后一个 `)` 之后切 */
export function parseProcStat(text: string): StatFields | null {
  const close = text.lastIndexOf(")");
  if (close === -1) return null;
  const rest = text
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  // rest[0] 是第 3 项 state，所以第 5 项 pgrp 是 rest[2]，第 22 项 starttime 是 rest[19]
  const pgid = Number(rest[2]);
  const ticks = Number(rest[19]);
  if (!Number.isInteger(pgid) || !Number.isFinite(ticks)) return null;
  const tty = Number(rest[4]);
  return { pgid, startTime: ticks * TICK_MS, tty: Number.isInteger(tty) ? tty : 0 };
}

const statPath = (pid: number) => `/proc/${pid}/stat`;

async function snapshot(): Promise<ProcessEntry[]> {
  const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number);
  // 并发读：几百个小文件，逐个等会拖慢每次核对身份
  const entries = await Promise.all(
    pids.map(async (pid): Promise<ProcessEntry | null> => {
      try {
        const fields = parseProcStat(await readFile(statPath(pid), "utf8"));
        return fields ? { pid, pgid: fields.pgid, startTime: fields.startTime } : null;
      } catch {
        // 读的时候进程刚好退出，当它不存在
        return null;
      }
    }),
  );
  return entries.filter((entry): entry is ProcessEntry => entry !== null);
}

// /proc/<pid>/environ 是启动时的环境，以 NUL 分隔；只有同一用户（或有权限）的进程读得到，读不到的跳过。
// 精确匹配整条 name=value，没有 macOS 上“环境接在命令后面”的歧义
async function findByEnv(name: string, value: string): Promise<ProcessEntry[]> {
  const wanted = `${name}=${value}`;
  const hits = await Promise.all(
    (await snapshot()).map(async (entry) => {
      try {
        const environ = await readFile(`/proc/${entry.pid}/environ`, "utf8");
        return environ.split("\0").includes(wanted) ? entry : null;
      } catch {
        return null;
      }
    }),
  );
  return hits.filter((entry): entry is ProcessEntry => entry !== null);
}

// 与 pid 共用控制终端的进程：tty_nr 相同且不为 0
async function terminalPeers(pid: number): Promise<ProcessEntry[]> {
  const read = async (id: number): Promise<(StatFields & { pid: number }) | null> => {
    try {
      const fields = parseProcStat(await readFile(statPath(id), "utf8"));
      return fields ? { pid: id, ...fields } : null;
    } catch {
      return null;
    }
  };
  const mine = await read(pid);
  if (mine === null || mine.tty === 0) return [];
  const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number);
  const all = await Promise.all(pids.map(read));
  return all
    .filter(
      (entry): entry is StatFields & { pid: number } => entry !== null && entry.tty === mine.tty,
    )
    .map((entry) => ({ pid: entry.pid, pgid: entry.pgid, startTime: entry.startTime }));
}

export function createProcSource(): ProcessSource {
  return {
    snapshot,
    findByEnv,
    terminalPeers,
    async startTime(pid) {
      try {
        return parseProcStat(await readFile(statPath(pid), "utf8"))?.startTime ?? null;
      } catch {
        return null;
      }
    },
    startTimeSync(pid) {
      try {
        return parseProcStat(readFileSync(statPath(pid), "utf8"))?.startTime ?? null;
      } catch {
        return null;
      }
    },
  };
}
