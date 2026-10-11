// K2 的实验入口。用法见 ../README.md。
//   node src/run.mjs --runners vite,next --reps 50 --out results/x.json [--methods taskkill,job] [--scenarios cycle,inflight,...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { RUNNERS, writeFixture } from "./fixtures.mjs";
import { canBind, httpStatus, now, openInflight, pickPort, sleep, timeUntilBindable, waitReady } from "./ports.mjs";
import { initProcs, scanCmdline, scanCwd, scanEnvTag, snapshot } from "./procs.mjs";
import { forgetRun, JOB_EXE, killLeftover, readReport, startRun, stopRun, which } from "./runs.mjs";
import { summarize } from "./summarize.mjs";

const isWin = process.platform === "win32";
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
);
const list = (v, d) => (v ? v.split(",").filter(Boolean) : d);
const REPS = Number(args.reps ?? 50);
const GRACE_MS = Number(args.grace ?? 3000); // §4.4 例子里的 graceMs
const READY_TIMEOUT = Number(args["ready-timeout"] ?? 90000);
const runnerIds = list(args.runners, Object.keys(RUNNERS));
const methods = list(args.methods, isWin ? ["taskkill", "job"] : ["group"]);
const scenarios = new Set(list(args.scenarios, ["cycle", "inflight", "startup", "kill", "interrupt", "install", "variants"]));
const outFile = resolve(args.out ?? `results/${process.platform}-${Date.now()}.json`);

const root = realpathSync(mkdtempSync(join(args.tmp ? resolve(args.tmp) : os.tmpdir(), "k2-")));
const session = `k2${process.pid}x${Date.now().toString(36)}`;
const procs = initProcs(root);
const SAMPLE_MS = isWin ? 350 : 120;
const DEADLINE_MIN = Number(args["deadline-min"] ?? 0); // 0 = 不限。CI 上设成比任务超时短几分钟，保证结果写得出来
const T0 = performance.now();
const elapsed = () => `[${Math.round((performance.now() - T0) / 1000)}s]`;
const pastDeadline = () => DEADLINE_MIN > 0 && performance.now() - T0 > DEADLINE_MIN * 60000;
let activity = "启动";
const records = [];
const notes = [];
let seq = 0;

// 子进程的环境：去掉 CI 相关变量（用户机器上没有），缓存全部指到临时目录里，不碰用户自己的缓存。
function childEnv(port, tag) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(CI|GITHUB_ACTIONS|FORCE_COLOR)$/i.test(k)) delete env[k];
  return {
    ...env,
    PORT: String(port),
    K2_TAG: tag,
    NEXT_TELEMETRY_DISABLED: "1",
    NUXT_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    GOCACHE: join(root, "_go", "cache"),
    GOTMPDIR: join(root, "_go", "tmp"),
    GOPATH: join(root, "_go", "path"),
    GOTOOLCHAIN: "local",
    GOTELEMETRY: "off",
    UV_CACHE_DIR: join(root, "_uv"),
    UV_PYTHON_DOWNLOADS: "never",
    UV_NO_CONFIG: "1",
    PYTHONUTF8: "1",
  };
}
mkdirSync(join(root, "_go", "tmp"), { recursive: true });

const shorten = (s) => s.replaceAll(root, "<tmp>").replaceAll(process.execPath, "node").replaceAll("\\", "/");
const fill = (argv, port, dir) => argv.map((a) => a.replaceAll("{port}", String(port)).replaceAll("{dir}", dir));
const describe = (p) => `${p.pid} ${shorten(p.cmd).slice(0, 140)}`;

// 停止之后查残留。返回：停止函数返回那一刻还活着的、等了最多 5 秒仍活着的（真正的残留）、以及只有标记/命令行/工作目录查得到的。
async function verify(h, tag, stopAt) {
  await h.tracker.stop();
  let snap = await h.tracker.sample();
  const aliveAtReturn = h.tracker.alive(snap);
  let alive = aliveAtReturn;
  const deadline = now() + 5000;
  while (alive.length > 0 && now() < deadline) {
    await sleep(40);
    snap = await h.tracker.sample();
    alive = h.tracker.alive(snap);
  }
  const treeDeadMs = alive.length === 0 ? now() - stopAt : null;
  // 进程树之外再查三样：带本次标记的、命令行里有临时目录的、工作目录在临时目录里的
  const scanExtra = async (shot) => {
    const byTag = ((await scanEnvTag(tag)) ?? []).filter((pid) => pid !== process.pid);
    const byCmd = scanCmdline(shot, root, procs.helperPids());
    const byCwd = ((await scanCwd(root)) ?? []).filter((pid) => pid !== process.pid);
    const pids = [...new Set([...byTag, ...byCmd, ...byCwd])].filter((pid) => !alive.some((p) => p.pid === pid));
    const byPid = new Map(shot.map((p) => [p.pid, p]));
    return { byTag, byCmd, pids, text: pids.map((pid) => (byPid.get(pid) ? describe(byPid.get(pid)) : String(pid))) };
  };
  let extra = await scanExtra(snap);
  const extraFirst = extra.text;
  // 查到了就再等最多 5 秒：自己很快走掉的算“短命”（比如 Next 退出时另起的遥测进程），5 秒后还在的才算残留
  const extraSince = now();
  while (extra.pids.length > 0 && now() - extraSince < 5000) {
    await sleep(100);
    snap = await snapshot();
    extra = await scanExtra(snap);
  }
  const untracked = extra.pids;
  const result = {
    aliveAtReturn: aliveAtReturn.map(describe),
    survivors: alive.map(describe),
    transient: untracked.length === 0 ? extraFirst : [],
    transientGoneMs: extraFirst.length && untracked.length === 0 ? Math.round(now() - stopAt) : null,
    untracked: extra.text,
    treeDeadMs,
    maxProcs: h.tracker.maxAlive,
  };
  const { byTag, byCmd } = extra;
  // 管道：树死光后 1 秒内 close 事件来了没有（有残留时不等，直接看）。没来就是有后代还拿着写端；产品代码不能等 close。
  if (h.child) {
    const closedAt = await Promise.race([h.closed, sleep(alive.length || untracked.length ? 0 : 1000).then(() => null)]);
    result.pipeHeld = closedAt === null;
  }
  // 兜底清理：采样记录过的按“进程号 + 启动时间”核对后结束；带本次标记的一定是自己的；只凭命令行认的只在 Windows 的 CI 上结束
  for (const p of alive) killLeftover(p, snap);
  if (alive.length || untracked.length) await sleep(300);
  for (const pid of untracked) {
    const mine = byTag.includes(pid) || (isWin && byCmd.includes(pid));
    if (mine) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // 已经没了
      }
    }
  }
  return result;
}

// 一次“启动 → [就绪] → 停止 → 查残留”。stopAfterMs 给了就不等就绪，到点就停（启动中途停止）。
async function cycle(ctx, opt = {}) {
  const { runnerId, method, dir, port } = ctx;
  const argv = fill(opt.argv ?? RUNNERS[runnerId].run, port, dir);
  const tag = `${session}-${++seq}`;
  const rec = { runner: runnerId, method, scenario: opt.scenario ?? "cycle", i: opt.i ?? 0, port };
  activity = `${runnerId}/${method}/${rec.scenario} #${rec.i}：启动`;
  let pre = await canBind(port);
  for (let i = 0; i < 20 && !pre.ok; i++) {
    await sleep(100);
    pre = await canBind(port);
  }
  if (!pre.ok) {
    rec.error = `启动前端口就被占着（${pre.code}）`;
    records.push(rec);
    return rec;
  }
  const reportFile = join(root, `_report-${seq}.txt`);
  const goTmp = join(root, "_go", "tmp");
  const goTmpBefore = runnerId === "go" ? readdirSync(goTmp).length : 0;
  let h;
  try {
    h = startRun({ argv, cwd: opt.cwd ?? dir, env: childEnv(port, tag), method, reportFile, sampleMs: SAMPLE_MS });
  } catch (err) {
    rec.error = `启动抛错：${err.message}`;
    rec.ready = false;
    records.push(rec);
    return rec;
  }
  let inflight = null;
  if (opt.stopAfterMs === undefined) {
    const ready = await waitReady(port, h.exited, READY_TIMEOUT);
    rec.ready = ready.ready;
    rec.startMs = Math.round(ready.ms);
    if (!ready.ready) rec.error = `没有就绪：${ready.reason}`;
    if (ready.ready && opt.wantTree) rec.tree = h.tracker.tree(await h.tracker.sample(), shorten);
    if (ready.ready && opt.inflight) {
      inflight = openInflight(port, RUNNERS[runnerId].slowPath ?? "/slow");
      await sleep(300);
    }
    if (ready.ready && opt.settleMs) await sleep(opt.settleMs);
  } else {
    await Promise.race([sleep(opt.stopAfterMs), h.exited]);
    rec.stoppedAtMs = Math.round(opt.stopAfterMs);
  }
  activity = `${runnerId}/${method}/${rec.scenario} #${rec.i}：停止`;
  const stopAt = now();
  const portProbe = timeUntilBindable(port, stopAt, 8000);
  let stop;
  try {
    stop = await stopRun(h, { mode: opt.mode ?? "graceful", graceMs: GRACE_MS });
  } catch (err) {
    stop = { steps: [{ what: `停止抛错：${err.message}` }], escalated: false, exit: {}, rootExitMs: null };
  }
  rec.stopReturnMs = Math.round(now() - stopAt);
  rec.stop = stop;
  const bind = await portProbe;
  rec.portMs = bind.ms === null ? null : Math.round(bind.ms);
  if (bind.ms === null) rec.portLastError = bind.lastCode;
  activity = `${runnerId}/${method}/${rec.scenario} #${rec.i}：查残留`;
  rec.leftover = await verify(h, tag, stopAt);
  rec.pipeHeld = rec.leftover.pipeHeld;
  // go run 被结束时有没有来得及删掉自己的 go-build 临时目录
  if (runnerId === "go") rec.goTmpLeft = readdirSync(goTmp).length - goTmpBefore;
  forgetRun(h);
  if (inflight) {
    rec.inflightEvents = inflight.events.join(",");
    inflight.destroy();
  }
  const report = readReport(reportFile);
  if (Object.keys(report).length) rec.jobReport = report;
  if (rec.error || rec.leftover.survivors.length || rec.leftover.untracked.length || rec.portMs === null) rec.outputTail = h.output.slice(-1500);
  records.push(rec);
  return rec;
}

// 跑一条命令到结束（安装依赖用），顺带查它退出后有没有留下进程
async function runToEnd(ctx, argv, cwd, extraEnv = {}) {
  const tag = `${session}-${++seq}`;
  const startedAt = now();
  const h = startRun({ argv, cwd, env: { ...childEnv(ctx.port, tag), ...extraEnv }, method: isWin ? "taskkill" : "group", sampleMs: SAMPLE_MS });
  activity = `${ctx.runnerId}：等 ${argv.join(" ")} 结束`;
  // 最多等 4 分钟：没有终端时有的工具会停在一个没人回答的确认提示上
  let exit = await Promise.race([h.exited, sleep(240000).then(() => null)]);
  const timedOut = exit === null;
  if (timedOut) exit = (await stopRun(h, { mode: "kill", graceMs: 0 })).exit;
  const ms = Math.round(now() - startedAt);
  const leftover = await verify(h, tag, now());
  forgetRun(h);
  return { code: timedOut ? "超时" : exit.code, signal: exit.signal, ms, leftover, outputTail: h.output.slice(-1200) };
}

// Windows 上刚被结束的进程可能还占着文件一小会儿：删不掉就记一笔，不让实验中断
function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    notes.push({ note: `删除目录失败：${shorten(dir)}`, error: err.code ?? err.message });
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 1000;

async function installScenario(ctx) {
  const runner = RUNNERS[ctx.runnerId];
  // 仓库已经热了（主项目装过一遍）。先量一次完整安装要多久，再在它的 25%、50%、75% 处停。
  const warmDir = join(root, `${ctx.runnerId}-warm`);
  writeFixture(ctx.runnerId, warmDir, root);
  const warm = await runToEnd(ctx, runner.setup, warmDir);
  notes.push({ runner: ctx.runnerId, note: "热缓存下完整安装一次", ms: warm.ms, code: warm.code });
  removeDir(warmDir);
  for (const [i, frac] of [0.25, 0.5, 0.75].entries()) {
    const dir = join(root, `${ctx.runnerId}-${ctx.method}-inst${i}`);
    writeFixture(ctx.runnerId, dir, root);
    const sub = { ...ctx, dir };
    const rec = await cycle(sub, { scenario: "install-stop", i, argv: runner.setup, stopAfterMs: warm.ms * frac });
    rec.nodeModulesAfterStop = existsSync(join(dir, "node_modules")) ? readdirSync(join(dir, "node_modules")).length : 0;
    // 中途停止之后原样再装一次：不设 CI，和用户机器上一样
    let again = await runToEnd(sub, runner.setup, dir);
    rec.reinstall = { code: again.code, ms: again.ms };
    if (again.code !== 0) {
      rec.reinstall.outputTail = again.outputTail;
      console.log(`  [${ctx.runnerId}/${ctx.method}] 中途停止后原样重装失败（${again.code}）：\n${again.outputTail.slice(-800)}`);
      again = await runToEnd(sub, runner.setup, dir, { CI: "true" });
      rec.reinstallWithCI = { code: again.code, ms: again.ms, outputTail: again.code === 0 ? undefined : again.outputTail };
    }
    const after = await cycle(sub, { scenario: "install-then-run", i });
    rec.runAfterReinstall = after.ready === true;
    removeDir(dir);
  }
}

// 把一个场景重复 count 次。连续两次出错就放弃这个场景（免得每次都等到超时），过了时限也不再开始新的。
async function repeat(ctx, scenario, count, fn) {
  const t0 = now();
  let failures = 0;
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (pastDeadline()) {
      notes.push({ runner: ctx.runnerId, method: ctx.method, note: `到时限，${scenario} 只做了 ${done}/${count} 次` });
      break;
    }
    const rec = await fn(i);
    done++;
    failures = rec.error ? failures + 1 : 0;
    if (rec.error) console.log(`  [${ctx.runnerId}/${ctx.method}/${scenario} #${i}] ${rec.error}\n${(rec.outputTail ?? "").slice(-600)}`);
    if (failures >= 2) {
      notes.push({ runner: ctx.runnerId, method: ctx.method, note: `${scenario} 连续两次出错，放弃（做了 ${done}/${count} 次）` });
      break;
    }
  }
  console.log(`  ${elapsed()} ${ctx.runnerId}/${ctx.method}/${scenario} ×${done} 用时 ${Math.round((now() - t0) / 1000)} 秒`);
  return failures < 2;
}

async function runnerMethod(ctx, reps) {
  const runner = RUNNERS[ctx.runnerId];
  const full = ["group", "taskkill", "job"].includes(ctx.method); // 其余办法只做对比，次数少
  const n = runner.control ? 3 : full ? reps : ctx.method === "pty-ctrlc" ? Math.min(reps, 5) : Math.min(reps, 15);
  if (scenarios.has("cycle")) {
    // 对照组要等中间进程退出（300 毫秒后）再停，孙进程才真的成了孤儿
    const ok = await repeat(ctx, "cycle", n, (i) => cycle(ctx, { i, wantTree: i === 0, settleMs: runner.control ? 900 : 0 }));
    if (!ok) return; // 起不来就不必做别的场景了
  }
  if (runner.control) return;
  const typical = median(records.filter((r) => r.runner === ctx.runnerId && r.method === ctx.method && r.ready).map((r) => r.startMs));
  if (scenarios.has("inflight")) await repeat(ctx, "inflight", full ? 5 : 3, (i) => cycle(ctx, { scenario: "inflight", i, inflight: true }));
  if (!full) return;
  if (scenarios.has("startup")) {
    // 启动到一半就停，然后马上正常启动一次：看残留的锁文件、写了一半的缓存会不会挡住下一次
    const fracs = [0.1, 0.3, 0.5, 0.7, 0.9];
    await repeat(ctx, "startup-stop", fracs.length, async (i) => {
      const rec = await cycle(ctx, { scenario: "startup-stop", i, stopAfterMs: typical * fracs[i] });
      const after = await cycle(ctx, { scenario: "startup-then-run", i });
      rec.runAfter = after.ready === true;
      return after;
    });
  }
  if (!isWin && scenarios.has("kill")) {
    // POSIX 上优雅停止几乎总是成功，这里单独逼出“强制结束”，再看下一次启动
    await repeat(ctx, "kill", 10, async (i) => {
      const rec = await cycle(ctx, { scenario: "kill", i, mode: "kill" });
      const after = await cycle(ctx, { scenario: "kill-then-run", i });
      rec.runAfter = after.ready === true;
      return after;
    });
  }
  if (!isWin && scenarios.has("interrupt")) await repeat(ctx, "interrupt", 10, (i) => cycle(ctx, { scenario: "interrupt", i, mode: "interrupt" }));
  if (scenarios.has("install") && runner.setup && !pastDeadline()) {
    const t0 = now();
    await installScenario(ctx);
    console.log(`  ${elapsed()} ${ctx.runnerId}/${ctx.method}/install 用时 ${Math.round((now() - t0) / 1000)} 秒`);
  }
  if (scenarios.has("variants")) {
    for (const [name, argv] of Object.entries(runner.variants ?? {})) {
      if (!which(argv[0], process.env)) {
        notes.push({ runner: ctx.runnerId, note: `变体 ${name} 跳过：本机没有 ${argv[0]}` });
        continue;
      }
      await repeat(ctx, `variant:${name}`, 5, (i) => cycle(ctx, { scenario: `variant:${name}`, i, argv, wantTree: i === 0 }));
    }
  }
}

// 设计里的静态页面：管理进程自己托管，不起进程。停止 = 关掉这个服务并断开所有连接。
async function staticInproc(reps) {
  const port = await pickPort();
  for (let i = 0; i < reps; i++) {
    const server = http.createServer((req, res) => {
      if (req.url === "/slow") return void setTimeout(() => res.end("slow"), 10000);
      res.end("<h1>static</h1>");
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const status = await httpStatus(port);
    const inflight = openInflight(port, "/slow");
    await sleep(50);
    const stopAt = now();
    server.close();
    server.closeAllConnections();
    const bind = await timeUntilBindable(port, stopAt);
    inflight.destroy();
    records.push({ runner: "static-inproc", method: "inproc", scenario: "cycle", i, port, ready: status === 200, portMs: Math.round(bind.ms ?? -1), stop: { steps: [], escalated: false, exit: {} }, leftover: { aliveAtReturn: [], survivors: [], untracked: [] } });
  }
}

function toolVersions() {
  const out = {};
  for (const [name, argv] of Object.entries({ pnpm: ["pnpm", "--version"], go: ["go", "version"], python: [isWin ? "python" : "python3", "--version"], uv: ["uv", "--version"] })) {
    try {
      const file = which(argv[0], process.env);
      out[name] = file ? execFileSync(file, argv.slice(1), { encoding: "utf8", shell: isWin && /\.cmd$/i.test(file) }).trim() : "（没有）";
    } catch (err) {
      out[name] = `查询失败：${err.message.slice(0, 80)}`;
    }
  }
  return out;
}

async function main() {
  const meta = {
    label: args.label ?? "",
    platform: process.platform,
    arch: process.arch,
    os: `${os.type()} ${os.release()} ${os.version()}`,
    cpus: `${os.cpus().length} × ${os.cpus()[0]?.model}`,
    node: process.version,
    ci: Boolean(process.env.GITHUB_ACTIONS),
    image: process.env.ImageOS ? `${process.env.ImageOS} ${process.env.ImageVersion}` : "本机",
    reps: REPS,
    graceMs: GRACE_MS,
    methods,
    tools: toolVersions(),
    startedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(meta, null, 2));
  if (isWin && methods.some((m) => m !== "taskkill" && m !== "pty-ctrlc") && !existsSync(JOB_EXE)) throw new Error(`先编译辅助程序：${JOB_EXE}`);
  const versions = {};
  try {
    for (const runnerId of runnerIds) {
      if (runnerId === "static-inproc") {
        await staticInproc(REPS);
        continue;
      }
      const runner = RUNNERS[runnerId];
      if (!which(runner.run[0], process.env)) {
        notes.push({ runner: runnerId, note: `跳过：本机没有 ${runner.run[0]}` });
        continue;
      }
      const dir = join(root, runnerId);
      writeFixture(runnerId, dir, root);
      const ctx = { runnerId, dir, port: await pickPort(), method: methods[0] };
      const t0 = now();
      if (runner.setup) {
        const setup = await runToEnd(ctx, runner.setup, dir);
        notes.push({ runner: runnerId, note: "第一次安装（仓库是冷的，要下载）", ms: setup.ms, code: setup.code, leftoverAfterExit: setup.leftover.survivors.length + setup.leftover.untracked.length });
        if (setup.code !== 0) {
          notes.push({ runner: runnerId, note: "安装失败，跳过这个运行器", outputTail: setup.outputTail });
          console.log(setup.outputTail);
          continue;
        }
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
          versions[`${runnerId}:${name}`] = JSON.parse(readFileSync(join(dir, "node_modules", name, "package.json"), "utf8")).version;
        }
      }
      for (const method of methods) {
        if (pastDeadline()) {
          notes.push({ runner: runnerId, method, note: "到时限，整个办法没有做" });
          continue;
        }
        console.log(`== ${elapsed()} ${runnerId} / ${method}`);
        await runnerMethod({ ...ctx, method }, REPS);
      }
      if (runnerId === "go") {
        // go run 被强制结束时来不及删自己的临时目录：数一数留下了多少
        const left = readdirSync(join(root, "_go", "tmp"));
        notes.push({ runner: "go", note: "GOTMPDIR 里留下的 go-build 临时目录数", count: left.length });
      }
      for (const cache of runner.caches ?? []) notes.push({ runner: runnerId, note: `缓存目录 ${cache} 结束时${existsSync(join(dir, cache)) ? "存在" : "不存在"}` });
      console.log(`   ${runnerId} 用时 ${Math.round((now() - t0) / 1000)} 秒`);
    }
  } finally {
    // 收尾：再查一遍整台机器上有没有带本次标记、或命令行里带临时目录的进程
    await sleep(500);
    const snap = await snapshot();
    const strayCmd = scanCmdline(snap, root, procs.helperPids());
    const strayCwd = (await scanCwd(root)) ?? [];
    meta.finalStray = { byCmdline: strayCmd.length, byCwd: strayCwd.length, detail: snap.filter((p) => strayCmd.includes(p.pid) || strayCwd.includes(p.pid)).map(describe) };
    meta.finishedAt = new Date().toISOString();
    meta.versions = versions;
    procs.stop();
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify({ meta, notes, records }, null, 1));
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        break;
      } catch (err) {
        if (i === 4) console.log(`临时目录删不掉：${root}：${err.message}`);
        await sleep(1000);
      }
    }
    meta.tmpRemoved = !existsSync(root);
    writeFileSync(outFile, JSON.stringify({ meta, notes, records }, null, 1));
    console.log(summarize({ meta, notes, records }));
    console.log(`结果：${outFile}；临时目录已删除：${meta.tmpRemoved}；收尾时的残留进程：${meta.finalStray.byCmdline + meta.finalStray.byCwd}`);
  }
}

// 硬时限：过了时限再给 3 分钟还没收尾，就把手头的结果写出来再退出，至少知道卡在哪
if (DEADLINE_MIN > 0) {
  setTimeout(() => {
    console.log(`硬时限到，卡在：${activity}`);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify({ meta: { label: args.label ?? "", platform: process.platform, os: os.release(), image: "", node: process.version, cpus: "", tools: {}, hung: activity }, notes, records }, null, 1));
    process.exit(3);
  }, (DEADLINE_MIN + 3) * 60000).unref();
}

await main();
// node-pty 等会留下还开着的句柄，不显式退出进程就一直挂着
process.exit(0);
