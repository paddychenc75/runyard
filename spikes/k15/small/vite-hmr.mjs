// 真实 Vite 7 开发服务器的热更新长连接能否被“数端口上的已建立连接”看到。
// 浏览器的热更新客户端本质是：连 ws://host:port/?token=…，子协议 vite-hmr。这里用 Node 的 WebSocket 做同样的事（没有真浏览器）。
// Vite 只装在临时目录里（7.3.6 有已知公告，不进仓库的锁文件，只绑 127.0.0.1 跑几秒）。
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import { join } from "node:path";
import { run, tempDir, write, saveResult } from "../lib.mjs";

const dir = tempDir("vite-hmr");
write(dir, "package.json", JSON.stringify({ name: "v", private: true, version: "1.0.0", type: "module", devDependencies: { vite: "7.3.6" } }));
write(dir, "pnpm-workspace.yaml", `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 20160\nallowBuilds:\n  esbuild: true\n`);
write(dir, "index.html", `<!doctype html><script type="module" src="/main.js"></script><p>hi</p>`);
write(dir, "main.js", `console.log("x")`);
const inst = run("pnpm", ["install"], { cwd: dir, env: { CI: "" } });
if (inst.code !== 0) { console.error(inst.out); process.exit(1); }
const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const child = spawn(process.execPath, [join(dir, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
const sample = () => {
  if (process.platform === "win32") return execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).split("\n").filter((l) => l.includes("ESTABLISHED") && l.includes(`127.0.0.1:${port}`)).length;
  try { return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:ESTABLISHED", "-Fn"], { encoding: "utf8" }).split("\n").filter((l) => l.startsWith("n")).length; } catch { return 0; }
};
const out = { vite: "7.3.6", port: "(动态)" };
try {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { connection: "close" } }); await r.text(); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const client = await (await fetch(`http://127.0.0.1:${port}/@vite/client`, { headers: { connection: "close" } })).text(); await new Promise((r) => setTimeout(r, 500));
  const token = /const wsToken = "([^"]+)"/.exec(client)?.[1];
  out.tokenFound = Boolean(token);
  await new Promise((r) => setTimeout(r, 300));
  out.before = sample();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`, "vite-hmr");
  const opened = await new Promise((res) => { ws.addEventListener("open", () => res(true)); ws.addEventListener("error", () => res(false)); setTimeout(() => res(false), 5000); });
  out.wsOpened = opened;
  await new Promise((r) => setTimeout(r, 500));
  out.withHmrConnection = sample();
  ws.close();
  await new Promise((r) => setTimeout(r, 800));
  out.afterClose = sample();
} finally {
  child.kill(); // 只结束自己启动的这个子进程
}
saveResult(`vite-hmr-${process.platform}`, out);
console.log(JSON.stringify(out, null, 2));
