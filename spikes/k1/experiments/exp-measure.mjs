// 实验 F：测量。启动耗时、空闲内存、macOS 上有没有 Dock 图标、socket 路径的长度上限。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { cleanupState, cli, electronExec, isWin, newState, SESSION, sleep, startsOf, stats } from "../lib/harness.mjs";
import { lsappinfoType } from "./exp-lifetime.mjs";

const electronLaunch = () => ["--supervisor-exec", electronExec(), "--supervisor-electron"];

// 启动耗时：从客户端调用 spawn 到握手完成。两种宿主各测 n 次，每次都是全新的状态目录。
export async function startup({ quick }) {
  const n = quick ? 5 : 30;
  const out = {};
  for (const host of ["node", "electron-as-node"]) {
    const launchToHandshake = [];
    const boot = [];
    const cliWall = [];
    for (let i = 0; i < n; i++) {
      const cfg = newState("su");
      try {
        const r = await cli(cfg, "ensure", host === "node" ? [] : electronLaunch());
        if (!r.ok || !r.started) throw new Error(`启动失败：${JSON.stringify(r)}`);
        launchToHandshake.push(r.timings.sinceLaunchMs);
        cliWall.push(r.wallMs);
        boot.push(startsOf(cfg).find((s) => s.phase === "listening")?.bootMs);
      } finally {
        await cleanupState(cfg);
      }
    }
    out[host] = {
      // 判定用的数字：spawn → 握手应答
      launchToHandshakeMs: stats(launchToHandshake),
      first5: launchToHandshake.slice(0, 5),
      // 管理进程自己的代码从第一行到开始监听（不含进程和运行时的启动）
      supervisorCodeBootMs: stats(boot),
      // 整条命令（普通 Node 跑的命令行进程启动 + 拉起管理进程 + 握手）的墙上时间
      cliColdWallMs: stats(cliWall),
    };
  }
  // 管理进程已经在的时候，一条命令要多久：分别用普通 Node 和“当作 Node 运行的 Electron”来跑命令行
  const cfg = newState("sw");
  try {
    await cli(cfg, "ensure");
    for (const [name, opts] of [["node", {}], ["electron-as-node", { exec: electronExec(), env: { ELECTRON_RUN_AS_NODE: "1" } }]]) {
      const wall = [];
      const connect = [];
      for (let i = 0; i < n; i++) {
        const r = await cli(cfg, "ping", [], opts);
        if (!r.ok) throw new Error(JSON.stringify(r));
        wall.push(r.wallMs);
        connect.push(r.ensureMs);
      }
      out[`warmCliWith_${name}`] = { wholeCommandWallMs: stats(wall), connectAndHandshakeMs: stats(connect) };
    }
  } finally {
    await cleanupState(cfg);
  }
  return { pass: null, repetitions: n, ...out };
}

// 空闲内存，以及 macOS 上“当作 Node 运行的 Electron”会不会在 Dock 里出现
export async function memoryAndDock({ quick }) {
  const out = {};
  for (const host of ["node", "electron-as-node"]) {
    const samples = [];
    for (let i = 0; i < (quick ? 1 : 3); i++) {
      const cfg = newState("mm");
      try {
        const r = await cli(cfg, "ensure", host === "node" ? [] : electronLaunch());
        // 启动后的头 3 秒每 100 毫秒看一次：Dock 图标哪怕只跳一下也能看到
        const dockSeen = new Set();
        for (let t = 0; t < 30; t++) {
          dockSeen.add(String(lsappinfoType(r.supervisorPid)));
          await sleep(100);
        }
        const info = (await cli(cfg, "supervisor.info")).result;
        let psRssKb = null;
        if (!isWin) psRssKb = Number(execFileSync("ps", ["-o", "rss=", "-p", String(r.supervisorPid)], { encoding: "utf8" }).trim());
        samples.push({ rssMb: Number((info.rss / 2 ** 20).toFixed(1)), psRssMb: psRssKb ? Number((psRssKb / 1024).toFixed(1)) : null, versions: info.versions, dockSeen: [...dockSeen] });
      } finally {
        await cleanupState(cfg);
      }
    }
    out[host] = { idleRssMb: samples.map((s) => s.rssMb), psRssMb: samples.map((s) => s.psRssMb), runtime: samples[0].versions, lsappinfo: process.platform === "darwin" ? samples.map((s) => s.dockSeen) : "只在 macOS 上检查" };
  }
  // macOS：每次取样都是 null（没有登记到 LaunchServices）才算“没有 Dock 图标”
  const noDock = process.platform !== "darwin" ? null : out["electron-as-node"].lsappinfo.every((seen) => seen.length === 1 && seen[0] === "null");
  return { pass: noDock, ...out };
}

// POSIX：socket 路径有长度上限（macOS 104 字节，Linux 108 字节，含结尾的 0）。主目录很长时 ~/.runyard/run/supervisor.sock 会不会超
export async function pathLength() {
  if (isWin) return { skipped: "Windows 用命名管道，没有这个限制" };
  const base = fs.mkdtempSync(path.join(process.env.K1_TMP_BASE || os.tmpdir(), `${SESSION}-len-`));
  const tryLen = (len) =>
    new Promise((resolve) => {
      const file = path.join(base, "x".repeat(len - base.length - 1));
      const server = net.createServer();
      server.once("error", (err) => resolve({ bytes: len, result: err.code }));
      server.listen(file, () => server.close(() => resolve({ bytes: len, result: "ok" })));
    });
  try {
    const tries = [];
    for (const len of [100, 103, 104, 107, 108, 120]) tries.push(await tryLen(len));
    const home = os.homedir();
    return { pass: null, tries, thisMachine: { home, realSocketPathBytes: Buffer.byteLength(path.join(home, ".runyard-dev", "run", "supervisor.sock")) } };
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}
