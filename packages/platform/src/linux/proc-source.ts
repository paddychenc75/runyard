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
  return { pgid, startTime: ticks * TICK_MS };
}

const statPath = (pid: number) => `/proc/${pid}/stat`;

export function createProcSource(): ProcessSource {
  return {
    async snapshot() {
      const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(Number);
      // 并发读：几百个小文件，逐个等会拖慢每次核对身份
      const entries = await Promise.all(
        pids.map(async (pid): Promise<ProcessEntry | null> => {
          try {
            const fields = parseProcStat(await readFile(statPath(pid), "utf8"));
            return fields ? { pid, ...fields } : null;
          } catch {
            // 读的时候进程刚好退出，当它不存在
            return null;
          }
        }),
      );
      return entries.filter((entry): entry is ProcessEntry => entry !== null);
    },
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
