// pnpm install、Vite dev、Next dev：真实开发命令，走管道。
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runCase } from "../lib/case.mjs";
import { REC_COLOR, REC_NOCOLOR, withProfile } from "../lib/env.mjs";
import { copyFixture, freePort, get, rmrf, sleep } from "../lib/helpers.mjs";
import { resolveCommand } from "../lib/tools.mjs";

const pnpmEnv = (ctx, p = {}) => withProfile({ npm_config_store_dir: path.join(ctx.base, "pnpm-store"), npm_config_cache_dir: path.join(ctx.base, "pnpm-cache"), npm_config_state_dir: path.join(ctx.base, "pnpm-state"), ...p });

async function install(ctx, dir, pn, pe, extraArgs = [], rep) {
  const r = resolveCommand("pnpm", ["install", "--frozen-lockfile", `--store-dir=${path.join(ctx.base, "pnpm-store")}`, ...extraArgs]);
  if (!r) return ctx.skip("pnpm", "没找到 pnpm");
  rmrf(path.join(dir, "node_modules"));
  return runCase(ctx, { id: `pnpm-install.${path.basename(dir)}.${pn}`, tool: "pnpm-install", scenario: `install-${path.basename(dir)}`, profile: pn, envDelta: pe, run: { ...r, cwd: dir, env: pnpmEnv(ctx, pe) }, markers: ["Done in"], rep, timeoutMs: 300000, keepFirstLines: 10 });
}

export async function runPnpm(ctx) {
  const dir = path.join(ctx.base, "vite");
  copyFixture("vite", dir);
  const variants = [
    ["default", {}, []],
    ["no-color", { NO_COLOR: "1" }, []],
    ["force-color", { FORCE_COLOR: "1" }, []],
    ["ci-1", { CI: "1" }, []],
    ["term-dumb", { TERM: "dumb" }, []],
    ["flag-reporter-append-only", {}, ["--reporter=append-only"]],
    ["flag-reporter-silent", {}, ["--reporter=silent"]],
    ["rec-nocolor", REC_NOCOLOR, []],
  ];
  for (const [pn, pe, args] of variants) if (ctx.wantProfile(pn)) await install(ctx, dir, pn, pe, args);
}

async function ensureInstalled(ctx, name) {
  const dir = path.join(ctx.base, name);
  copyFixture(name, dir);
  const r = resolveCommand("pnpm", ["install", "--frozen-lockfile", "--reporter=silent", `--store-dir=${path.join(ctx.base, "pnpm-store")}`]);
  if (!r) throw new Error("没找到 pnpm");
  const { startCapture } = await import("../lib/capture.mjs");
  const h = startCapture({ ...r, cwd: dir, env: pnpmEnv(ctx) });
  const exit = await h.finish(300000);
  if (exit.code !== 0) throw new Error(`pnpm install ${name} 失败：${exit.code}\n${h.text()}`);
  return dir;
}

const EDIT_OK = (n) => `export function App() {\n  return <h1>中文测试：你好，世界 v${n}</h1>;\n}\n`;
const EDIT_BAD = `export function App() {\n  return <h1>中文语法错误 </h2>;\n}\n`;

const WEB_PROFILES = (flagKey) => [
  ["default", {}, []],
  ["force-color", { FORCE_COLOR: "1" }, []],
  ["no-color", { NO_COLOR: "1" }, []],
  ["force-color-0", { FORCE_COLOR: "0" }, []],
  ["ci-1", { CI: "1" }, []],
  ["term-dumb", { TERM: "dumb" }, []],
  ["flag-no-color", {}, ["--no-color"]],
  ["rec-nocolor", { ...REC_NOCOLOR, TERM: "dumb" }, flagKey === "vite" ? ["--clearScreen", "false"] : []],
  ["rec-color", REC_COLOR, flagKey === "vite" ? ["--clearScreen", "false"] : []],
];

export async function runVite(ctx) {
  let dir;
  try {
    dir = await ensureInstalled(ctx, "vite");
  } catch (e) {
    return ctx.skip("vite", String(e.message));
  }
  const app = path.join(dir, "src", "App.jsx");
  const orig = readFileSync(app, "utf8");
  for (const [pn, pe, extra] of WEB_PROFILES("vite")) {
    if (!ctx.wantProfile(pn)) continue;
    rmrf(path.join(dir, "node_modules", ".vite"));
    writeFileSync(app, orig);
    const port = await freePort();
    await runCase(ctx, {
      port, id: `vite.dev.${pn}`, tool: "vite", scenario: "dev", profile: pn, envDelta: pe,
      run: { cmd: process.execPath, args: [path.join(dir, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort", "--host", "127.0.0.1", ...extra], cwd: dir, env: withProfile(pe) },
      markers: ["Local:", "hmr update", "中文语法错误", "App.jsx"], keepFirstLines: 40, timeoutMs: 150000,
      drive: async (h) => {
        const out = {};
        await h.waitFor(/Local:|ready in/i, 60000);
        out.readyLineMs = Math.round(performance.timeOrigin + performance.now() - h.startedAt);
        const base = `http://127.0.0.1:${port}`;
        // 建立 HMR 的 WebSocket 连接，Vite 才会在文件变化时打印 hmr update
        const ws = new WebSocket(`ws://127.0.0.1:${port}/`, "vite-hmr");
        await new Promise((res) => { ws.onopen = res; ws.onerror = res; setTimeout(res, 5000); });
        out.first = await get(`${base}/src/main.jsx`);
        await get(`${base}/src/App.jsx`);
        const tEdit = Date.now();
        writeFileSync(app, EDIT_OK(1));
        out.hmr = await h.waitFor(/hmr update/i, 20000).then(() => true, () => false);
        out.hmrLineAfterEditMs = Date.now() - tEdit; // 轮询粒度 50ms
        writeFileSync(app, EDIT_BAD);
        await sleep(300);
        out.badStatus = await get(`${base}/src/App.jsx`);
        out.errorSeen = await h.waitFor(/error/i, 15000).then(() => true, () => false);
        await sleep(500);
        try { ws.close(); } catch {}
        return out;
      },
    });
  }
  writeFileSync(app, orig);
}

export async function runNext(ctx) {
  let dir;
  try {
    dir = await ensureInstalled(ctx, "next");
  } catch (e) {
    return ctx.skip("next", String(e.message));
  }
  const page = path.join(dir, "app", "page.jsx");
  const orig = readFileSync(page, "utf8");
  const ok = (n) => `export default function Page() {\n  return <h1>中文测试：你好，世界 v${n}</h1>;\n}\n`;
  const bad = `export default function Page() {\n  return <h1>中文语法错误 </h2>;\n}\n`;
  for (const [pn, pe, extra] of WEB_PROFILES("next")) {
    if (!ctx.wantProfile(pn)) continue;
    rmrf(path.join(dir, ".next"));
    writeFileSync(page, orig);
    const port = await freePort();
    await runCase(ctx, {
      port, id: `next.dev.${pn}`, tool: "next", scenario: "dev", profile: pn, envDelta: pe,
      run: { cmd: process.execPath, args: [path.join(dir, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port), "-H", "127.0.0.1", ...extra], cwd: dir, env: withProfile(pe) },
      markers: ["Ready", "中文语法错误", "page.jsx"], keepFirstLines: 50, timeoutMs: 240000,
      drive: async (h) => {
        const out = {};
        await h.waitFor(/Ready in/i, 120000);
        out.readyLineMs = Math.round(performance.timeOrigin + performance.now() - h.startedAt);
        const base = `http://127.0.0.1:${port}`;
        out.first = await get(`${base}/`, 120000);
        writeFileSync(page, ok(1));
        await sleep(500);
        out.edit = await get(`${base}/`, 120000);
        writeFileSync(page, bad);
        await sleep(500);
        out.badStatus = await get(`${base}/`, 120000);
        out.errorSeen = await h.waitFor(/error|×|⨯/i, 20000).then(() => true, () => false);
        await sleep(1000);
        return out;
      },
    });
  }
  writeFileSync(page, orig);
}
