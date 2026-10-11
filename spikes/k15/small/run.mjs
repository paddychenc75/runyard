// 技术设计 §11.1 K15 行下面“顺带确认的小项”里能直接测的几项：
//  1) localhost 的解析顺序与“只绑 127.0.0.1 / 只绑 ::1”时用 localhost、127.0.0.1 访问的结果
//  2) 端口连接数采样（lsof / netstat）能否看到一条长连接（热更新的 WebSocket 在 TCP 层就是一条长连接）
//  3) pnpm 在没有终端时遇到“要不要重装 node_modules”的确认提示是什么表现（有无 CI 变量）
//  4) 真实 Vite 的热更新连接能否被采样看到（仅在 --vite 且本机/CI 能装时做）
import net from "node:net";
import nodeCrypto from "node:crypto";
import http from "node:http";
import dns from "node:dns/promises";
import { execFileSync } from "node:child_process";
import { run, tempDir, write, read, saveResult, tail } from "../lib.mjs";

const results = { node: process.version, platform: process.platform, arch: process.arch, when: new Date().toISOString() };
const listen = (server, host) => new Promise((res, rej) => { server.once("error", rej); server.listen(0, host, () => res(server.address().port)); });
const get = async (url) => { const t0 = performance.now(); try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); return { ok: r.ok, ms: Math.round(performance.now() - t0) }; } catch (e) { return { ok: false, error: String(e.cause?.code ?? e.message), ms: Math.round(performance.now() - t0) }; } };

// 1) localhost
{
  const out = { lookupAll: await dns.lookup("localhost", { all: true }), autoSelectFamilyDefault: net.getDefaultAutoSelectFamily() };
  for (const [name, host] of [["只绑 127.0.0.1", "127.0.0.1"], ["只绑 ::1", "::1"], ["绑 0.0.0.0", "0.0.0.0"], ["绑 ::（双栈）", "::"]]) {
    const s = http.createServer((_, r) => r.end("ok"));
    let port;
    try { port = await listen(s, host); } catch (e) { out[name] = { bindError: e.code }; continue; }
    out[name] = { "http://localhost": await get(`http://localhost:${port}/`), "http://127.0.0.1": await get(`http://127.0.0.1:${port}/`), "http://[::1]": await get(`http://[::1]:${port}/`) };
    s.close();
  }
  results.localhost = out;
}

// 2) 端口连接数采样
function sample(port) {
  if (process.platform === "win32") {
    const t = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    return t.split("\n").filter((l) => l.includes("ESTABLISHED") && (l.includes(`127.0.0.1:${port}`) || l.includes(`[::1]:${port}`))).length;
  }
  try { return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:ESTABLISHED", "-Fn"], { encoding: "utf8" }).split("\n").filter((l) => l.startsWith("n")).length; }
  catch { return 0; } // lsof 没找到时退出码 1
}
{
  const sockets = new Set();
  const server = http.createServer((req, res) => res.end("ok"));
  server.on("upgrade", (req, socket) => { // 最小的 WebSocket 握手：只为了留一条长连接
    const key = req.headers["sec-websocket-key"];
    const { createHash } = nodeCrypto;
    const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on("data", () => socket.end()); // 客户端发来关闭帧后结束连接
  });
  const port = await listen(server, "127.0.0.1");
  const out = { baseline: sample(port) };
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
  await new Promise((r) => ws.addEventListener("open", r));
  await new Promise((r) => setTimeout(r, 300));
  out["开着一条长连接（服务端和客户端在同一台机器，所以每条连接会出现两端）"] = sample(port);
  await new Promise((res) => http.get({ host: "127.0.0.1", port, agent: false, headers: { connection: "close" } }, (r) => { r.resume(); r.on("end", res); }));
  await new Promise((r) => setTimeout(r, 200));
  out["再发一次 Connection: close 的短请求后（应仍是长连接那一条的两端）"] = sample(port);
  ws.close(); await new Promise((r) => setTimeout(r, 300));
  out["关掉长连接后"] = sample(port);
  results.portSampling = out;
  for (const s of sockets) s.destroy();
  server.close();
}

// 3) pnpm 无终端确认提示：node_modules 是用另一套设置装的，pnpm 会询问是否清掉重装
{
  const out = {};
  const triggers = { "shamefullyHoist 开关（会触发清空 node_modules 的确认）": ["", "shamefullyHoist: true\n"] };
  for (const [name, [before, after]] of Object.entries(triggers)) {
    for (const [ci, label, extra] of [["", "无终端、无 CI 变量", []], ["true", "无终端、CI=true", []], ["", "无终端、无 CI、--config.confirmModulesPurge=false", ["--config.confirmModulesPurge=false"]], ["", "无终端、无 CI、环境变量 npm_config_confirm_modules_purge=false", []]]) {
      const dir = tempDir("pnpm-tty");
      const ws = (extra) => `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 0\n${extra}`;
      write(dir, "package.json", JSON.stringify({ name: "t", private: true, version: "1.0.0", dependencies: { "is-number": "7.0.0" } }));
      write(dir, "pnpm-workspace.yaml", ws(before));
      const first = run("pnpm", ["install"], { cwd: dir, env: { CI: "" } });
      write(dir, "pnpm-workspace.yaml", ws(after));
      const env = { CI: ci, ...(label.includes("环境变量") ? { npm_config_confirm_modules_purge: "false" } : {}) };
      const r = run("pnpm", ["install", ...extra], { cwd: dir, env, input: "" });
      out[`${name} / ${label}`] = { firstInstall: first.code, code: r.code, text: tail(r.out.replace(/\s+\n/g, "\n"), 5).slice(0, 420) };
    }
  }
  results.pnpmNoTty = out;
}

saveResult(`small-${process.platform}`, results);
console.log(JSON.stringify(results, null, 2));
