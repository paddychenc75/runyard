// 入口：node run.mjs --out <结果目录> [--only languages,vite,next,pnpm,native,selftest] [--cn] [--profiles default,rec-nocolor]
// 全部临时文件放在系统临时目录下一个自建目录里，结束（或失败）时整个删掉。
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { isAlive, startedInfo, startedPids } from "./lib/capture.mjs";
import { rmrf } from "./lib/helpers.mjs";
import { toolVersions, tryRun } from "./lib/tools.mjs";
import { collectEncodingInfo, runWindowsNative, selfTest } from "./scenarios/encoding.mjs";
import { runNext, runPnpm, runVite } from "./scenarios/frameworks.mjs";
import { runLanguages } from "./scenarios/languages.mjs";
import { writeReport } from "./report.mjs";

const { values } = parseArgs({ options: { out: { type: "string" }, only: { type: "string" }, cn: { type: "boolean" }, profiles: { type: "string" } } });
const out = path.resolve(values.out ?? "k4-results");
const only = values.only ? values.only.split(",") : ["selftest", "native", "languages", "pnpm", "vite", "next"];
const want = values.profiles ? new Set(values.profiles.split(",")) : null;
// Windows 的临时目录常是 8.3 短名（RUNNER~1），Vite 的 fs.allow 比较的是真实路径，不展开会得到 403
const tmpRoot = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "k4-")));
// --cn：把所有工作目录放进“含中文和空格”的路径（任务 5）
const base = values.cn ? path.join(tmpRoot, "运行场 测试", "项目 一") : path.join(tmpRoot, "work");
mkdirSync(base, { recursive: true });
mkdirSync(out, { recursive: true });

const ctx = {
  base,
  mode: values.cn ? "cn" : "normal",
  rawDir: path.join(out, "raw"),
  results: [],
  skipped: [],
  skip(what, why) {
    console.log(`[skip] ${what}: ${why}`);
    ctx.skipped.push({ what, why });
  },
  wantProfile: (p) => !want || want.has(p),
};

let exitCode = 0;
try {
  const env = { node: process.version, platform: `${process.platform}/${process.arch}`, os: `${os.type()} ${os.release()}`, base, tools: toolVersions(), encoding: collectEncodingInfo(), cn: !!values.cn };
  writeFileSync(path.join(out, "env.json"), JSON.stringify(env, null, 2));
  console.log(JSON.stringify(env, null, 2));
  if (only.includes("selftest")) {
    ctx.selfTest = selfTest();
    for (const t of ctx.selfTest) console.log(`[selftest] ${t.ok ? "ok  " : "FAIL"} ${t.name}${t.detail ? " -- " + t.detail : ""}`);
    if (ctx.selfTest.some((t) => !t.ok)) exitCode = 1;
  }
  if (only.includes("native")) await runWindowsNative(ctx);
  if (only.includes("languages")) await runLanguages(ctx);
  if (only.includes("pnpm")) await runPnpm(ctx);
  if (only.includes("vite")) await runVite(ctx);
  if (only.includes("next")) await runNext(ctx);
  // 清理核对：我们启动的每个 pid 是否还活着；有端口的用例结束后端口是否已关
  const alive = startedPids.filter(isAlive);
  const portsOpen = ctx.results.filter((r) => r.portStillOpenAfterStop).map((r) => r.id);
  // 活着的 pid 可能是 pid 被系统复用给了别的进程：记下它是谁、我们当初用它启动了什么、同一个 pid 被我们启动过几次
  const aliveInfo = alive.map((pid) => ({
    pid,
    startedTimes: startedInfo.filter((i) => i.pid === pid).length,
    ourCommand: startedInfo.filter((i) => i.pid === pid).map((i) => i.cmd),
    nowRunning: process.platform === "win32" ? tryRun("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]) : tryRun("ps", ["-p", String(pid), "-o", "comm="]),
  }));
  ctx.cleanup = { pidsStarted: startedPids.length, pidsStillAlive: alive, aliveInfo, portsStillOpen: portsOpen };
  console.log("[cleanup]", JSON.stringify(ctx.cleanup));
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ env, selfTest: ctx.selfTest, cleanup: ctx.cleanup, skipped: ctx.skipped, results: ctx.results }, null, 2));
  writeReport(out, { env, ctx });
} catch (e) {
  console.error("FAILED", e);
  exitCode = 1;
} finally {
  rmrf(tmpRoot);
}
process.exit(exitCode);
