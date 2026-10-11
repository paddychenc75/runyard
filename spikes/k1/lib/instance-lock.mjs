// 单实例：保证同一个状态目录（同一个 profile）下只有一个管理进程在监听。
//
// Windows：命名管道本身就是锁。libuv 建第一个实例时带 FILE_FLAG_FIRST_PIPE_INSTANCE，
//   同名管道已存在就失败；进程一死管道就消失，没有“残留”这回事。
// macOS / Linux：socket 文件在进程死后会留下来，再次 listen 一律 EADDRINUSE，
//   必须有人删掉它。“先探测、再删除、再监听”三步不是原子的，两个启动者可以互相删掉对方刚建好的文件
//   （naive 模式保留这个做法，用来实测它会不会出两个管理进程）。
//   kernel 模式另拿一把“进程死了内核自动放”的锁，拿到锁的人才许删文件和监听：
//     macOS：open() 带 O_EXLOCK|O_NONBLOCK（BSD 的打开即加锁；Node 把数值原样传给系统）。
//     Linux：没有 O_EXLOCK，用抽象命名空间的 socket（名字以 \0 开头，不落盘，进程死了自动消失）。
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { endpointOf, pathsOf } from "./config.mjs";

const O_EXLOCK = 0x20; // macOS <fcntl.h>；Node 的 fs.constants 里没有导出

// 这些句柄必须活到进程结束，放在模块级，防止被回收后锁被释放
const held = [];

const listenOnce = (server, endpoint) =>
  new Promise((resolve) => {
    const onError = (err) => resolve(err);
    server.once("error", onError);
    server.listen(endpoint, () => {
      server.off("error", onError);
      resolve(null);
    });
  });

// 探测连接点后面有没有活的监听者
const probe = (endpoint, timeoutMs = 500) =>
  new Promise((resolve) => {
    const s = net.connect(endpoint);
    const done = (alive) => {
      s.destroy();
      resolve(alive);
    };
    s.setTimeout(timeoutMs, () => done(true)); // 连上了但不说话，也算有人
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });

async function kernelLock(cfg) {
  const p = pathsOf(cfg);
  if (process.platform === "darwin") {
    try {
      const flags = fs.constants.O_RDWR | fs.constants.O_CREAT | O_EXLOCK | fs.constants.O_NONBLOCK;
      held.push(fs.openSync(p.lock, flags, 0o600));
      return true;
    } catch (err) {
      if (err.code === "EAGAIN") return false;
      throw err;
    }
  }
  // Linux：名字里带状态目录的摘要，不同 profile、不同测试互不相干
  const name = `\0runyard-lock-${crypto.createHash("sha256").update(cfg.stateDir).digest("hex").slice(0, 24)}`;
  const lockServer = net.createServer();
  const err = await listenOnce(lockServer, name);
  if (err) {
    if (err.code === "EADDRINUSE") return false;
    throw err;
  }
  lockServer.unref();
  held.push(lockServer);
  return true;
}

// 返回 { ok: true } 或 { ok: false, reason }。成功时 server 已经在连接点上监听。
export async function acquireAndListen(cfg, server) {
  const endpoint = endpointOf(cfg);

  if (process.platform === "win32") {
    const err = await listenOnce(server, endpoint);
    if (!err) return { ok: true, how: "pipe-first-instance" };
    if (err.code === "EADDRINUSE" || err.code === "EACCES") return { ok: false, reason: `endpoint-taken:${err.code}` };
    throw err;
  }

  if (cfg.lockMode === "kernel") {
    if (!(await kernelLock(cfg))) return { ok: false, reason: "lock-held" };
    // 拿到锁之后，连接点上不管留着什么都是残留，直接删
    fs.rmSync(endpoint, { force: true });
    const err = await listenOnce(server, endpoint);
    if (err) throw err;
    fs.chmodSync(endpoint, 0o600);
    return { ok: true, how: "kernel-lock" };
  }

  // naive：设计原文的做法
  for (let attempt = 0; attempt < 5; attempt++) {
    const err = await listenOnce(server, endpoint);
    if (!err) {
      fs.chmodSync(endpoint, 0o600);
      return { ok: true, how: "naive" };
    }
    if (err.code !== "EADDRINUSE") throw err;
    if (await probe(endpoint)) return { ok: false, reason: "endpoint-alive" };
    fs.rmSync(endpoint, { force: true }); // 残留文件：删掉重试。竞争就出在这一行
  }
  return { ok: false, reason: "naive-gave-up" };
}
