// 端口：只在 127.0.0.1 上试（技术设计 §4.5：探测不绑 0.0.0.0）。
import http from "node:http";
import net from "node:net";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => performance.now();

// “端口可重新绑定”的定义：在 127.0.0.1:<port> 上 listen 成功。与设计里 ports.isFree 的做法相同。
export function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => resolve({ ok: false, code: err.code }));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      server.close(() => resolve({ ok: true }));
    });
  });
}

// 在 20000–31999 里挑一个现在空闲的端口：避开三个系统的临时端口段，免得别的程序的出站连接碰巧占到。
export async function pickPort() {
  for (let i = 0; i < 200; i++) {
    const port = 20000 + Math.floor(Math.random() * 12000);
    if ((await canBind(port)).ok) return port;
  }
  throw new Error("找不到空闲端口");
}

// 从发出停止请求起每 15 毫秒试绑一次，返回第一次绑定成功时过了多少毫秒；超时返回 null。
export async function timeUntilBindable(port, startedAt, timeoutMs = 20000) {
  let lastCode = null;
  while (now() - startedAt < timeoutMs) {
    const r = await canBind(port);
    if (r.ok) return { ms: now() - startedAt, lastCode };
    lastCode = r.code;
    await sleep(15);
  }
  return { ms: null, lastCode };
}

export function httpStatus(port, path = "/", timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent: false, timeout: timeoutMs }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

// 就绪 = GET / 得到 200（Next、Nuxt 端口先开、页面后编译好，所以必须看 HTTP 响应，§4.5）。
// 进程先退出则返回 exited。
export async function waitReady(port, exited, timeoutMs) {
  const startedAt = now();
  let dead = false;
  exited.then(() => {
    dead = true;
  });
  while (now() - startedAt < timeoutMs) {
    if (dead) return { ready: false, reason: "exited", ms: now() - startedAt };
    if ((await httpStatus(port)) === 200) return { ready: true, ms: now() - startedAt };
    await sleep(60);
  }
  return { ready: false, reason: "timeout", ms: now() - startedAt };
}

// 制造“请求进行中”：一个还没回应的 /slow 请求，加一条连上后什么都不发的空闲连接（像热更新的长连接）。
export function openInflight(port, slowPath) {
  const events = [];
  const req = http.get({ host: "127.0.0.1", port, path: slowPath, agent: false }, (res) => {
    events.push(`slow:status:${res.statusCode}`);
    res.resume();
  });
  req.on("error", (err) => events.push(`slow:${err.code ?? err.message}`));
  req.on("close", () => events.push("slow:close"));
  const idle = net.connect({ host: "127.0.0.1", port });
  idle.on("error", (err) => events.push(`idle:${err.code}`));
  idle.on("close", () => events.push("idle:close"));
  return {
    events,
    destroy() {
      req.destroy();
      idle.destroy();
    },
  };
}
