import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

export const sleepMs = (n) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
export const now = () => performance.now();
export const round = (x) => Math.round(x * 10) / 10;
export const ps = (script, timeout = 120000) =>
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout });
export const run = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: "utf8", timeout: 120000, windowsHide: true, ...o });

export function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: round(s[0]), median: round(q(0.5)), p90: round(q(0.9)), max: round(s[s.length - 1]) };
}

/** 反复尝试 rename，直到成功或超时。返回耗时、尝试次数和见过的错误码。 */
export function renameUntilOk(from, to, limitMs = 15000, stepMs = 20) {
  const t0 = now();
  const codes = {};
  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      fs.renameSync(from, to);
      return { ok: true, ms: round(now() - t0), attempts, codes };
    } catch (e) {
      codes[e.code] = (codes[e.code] || 0) + 1;
      if (now() - t0 > limitMs) return { ok: false, ms: round(now() - t0), attempts, codes };
      sleepMs(stepMs);
    }
  }
}

/** 找一个空闲端口（只绑 127.0.0.1） */
export async function freePort() {
  const net = await import("node:net");
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on("error", rej);
  });
}

export function listFiles(dir, max = 5000) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < max) {
    const d = stack.pop();
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {}
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out;
}
