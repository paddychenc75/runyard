// Node+TS、Python（python / py / uv run）、Go：用同一套子命令比较颜色、编码、缓冲、顺序、强杀丢行。
import path from "node:path";
import { isWin } from "../lib/capture.mjs";
import { REC_COLOR, REC_NOCOLOR, withProfile } from "../lib/env.mjs";
import { copyFixture, sleep } from "../lib/helpers.mjs";
import { runCase } from "../lib/case.mjs";
import { which } from "../lib/tools.mjs";

const HELLO = ["中文测试：你好，世界 ASCII ok", "中文错误输出（stderr）：标准错误"];
const SYMBOLS = ["symbols ✓ ✗ → … 😀 ▲ ⨯"];
const ERR = ["中文错误：出错了", "before error 中文测试"];

const U8 = { PYTHONUTF8: "1" };

export async function runLanguages(ctx) {
  const dir = path.join(ctx.base, "programs");
  copyFixture("programs", dir);
  const py = isWin ? which("python") : which("python3") ?? which("python");
  const langs = [];
  langs.push({ tool: "node-ts", build: (sub) => ({ cmd: process.execPath, args: [path.join(dir, "prog.ts"), ...sub] }), killAfter: 3000 });
  if (py) langs.push({ tool: "python", build: (sub, flags = []) => ({ cmd: py, args: [...flags, path.join(dir, "prog.py"), ...sub] }), killAfter: 3000, python: true });
  else ctx.skip("python", "没找到 python");
  const pyl = isWin ? which("py") : null;
  if (pyl) langs.push({ tool: "python-py", build: (sub, flags = []) => ({ cmd: pyl, args: ["-3", ...flags, path.join(dir, "prog.py"), ...sub] }), killAfter: 3000, python: true });
  const uv = which("uv");
  if (uv) langs.push({ tool: "uv-run", build: (sub, flags = []) => ({ cmd: uv, args: flags.length ? ["run", "--no-project", "--quiet", "python", ...flags, path.join(dir, "prog.py"), ...sub] : ["run", "--no-project", "--quiet", path.join(dir, "prog.py"), ...sub] }), killAfter: 4000, python: true, uv: true });
  else ctx.skip("uv-run", "没找到 uv");
  const go = which("go");
  if (go) langs.push({ tool: "go-run", build: (sub) => ({ cmd: go, args: ["run", "main.go", ...sub] }), killAfter: 15000, goRun: true });
  else ctx.skip("go-run", "没找到 go（本机不装 Go，在 CI 上跑）");

  const profs = {
    default: {},
    "force-color": { FORCE_COLOR: "1" },
    "no-color": { NO_COLOR: "1" },
    "rec-nocolor": REC_NOCOLOR,
    "rec-color": REC_COLOR,
  };
  const pyProfs = {
    "py-utf8-mode": { PYTHONUTF8: "1" },
    "py-ioencoding-utf8": { PYTHONIOENCODING: "utf-8" },
    "sim-gbk-ioencoding": { PYTHONIOENCODING: "gbk" }, // 模拟中文 Windows（ACP=936）下 Python 往管道写 GBK
    "sim-gbk-ioencoding-unbuffered": { PYTHONIOENCODING: "gbk", PYTHONUNBUFFERED: "1" },
  };

  for (const L of langs) {
    const base = { cwd: L.goRun ? dir : dir, tool: L.tool };
    const mk = (sub, profEnv, flags) => {
      const b = L.build(sub, flags);
      return { cmd: b.cmd, args: b.args, cwd: dir, env: withProfile(profEnv) };
    };
    const all = { ...profs, ...(L.python ? pyProfs : {}) };
    // 1. hello：颜色 / 编码
    for (const [pn, pe] of Object.entries(all)) {
      if (!ctx.wantProfile(pn)) continue;
      const reps = pn === "default" || pn === "rec-nocolor" ? 3 : 1;
      for (let rep = 0; rep < reps; rep++) {
        await runCase(ctx, { id: `${L.tool}.hello.${pn}`, tool: L.tool, scenario: "hello", profile: pn, envDelta: pe, run: mk(["hello"], pe), markers: HELLO, rep: reps > 1 ? rep : undefined, keepFirstLines: 8, timeoutMs: 120000 });
      }
    }
    if (L.python && ctx.wantProfile("default")) {
      await runCase(ctx, { id: `${L.tool}.hello.flag-X-utf8`, tool: L.tool, scenario: "hello", profile: "flag-X-utf8", run: mk(["hello"], {}, ["-X", "utf8"]), markers: HELLO, keepFirstLines: 8 });
    }
    // 1b. symbols：GBK 里没有的符号
    for (const pn of ["default", "rec-nocolor", ...(L.python ? ["sim-gbk-ioencoding"] : [])]) {
      if (!ctx.wantProfile(pn)) continue;
      await runCase(ctx, { id: `${L.tool}.symbols.${pn}`, tool: L.tool, scenario: "symbols", profile: pn, envDelta: all[pn], run: mk(["symbols"], all[pn]), markers: SYMBOLS, keepFirstLines: 6 });
    }
    // 2. error：崩溃堆栈带中文
    for (const pn of ["default", "rec-nocolor", "rec-color", ...(L.python ? ["sim-gbk-ioencoding"] : [])]) {
      if (!ctx.wantProfile(pn)) continue;
      const pe = all[pn];
      await runCase(ctx, { id: `${L.tool}.error.${pn}`, tool: L.tool, scenario: "error", profile: pn, envDelta: pe, run: mk(["error"], pe), markers: ERR, keepFirstLines: 12 });
    }
    // 3. progress：\r 进度行
    for (const pn of ["default", "rec-nocolor"]) {
      if (!ctx.wantProfile(pn)) continue;
      await runCase(ctx, { id: `${L.tool}.progress.${pn}`, tool: L.tool, scenario: "progress", profile: pn, envDelta: all[pn], run: mk(["progress"], all[pn]), markers: ["进度 100%", "完成"], keepFirstLines: 6 });
    }
    if (ctx.mode === "cn") continue; // 中文路径只复核启动、编码、崩溃，不重复计时实验
    // 4. tick：一秒一行，看缓冲
    const tickVariants = L.python
      ? [
          ["default", {}, []], // Windows 上会因 cp1252 编码失败直接崩溃（见 hello），留着作对照
          // 下面四行都先用 PYTHONUTF8=1 排除编码崩溃，这样只剩缓冲这一个变量
          ["utf8-buffered", U8, []],
          ["utf8-flag-u", U8, ["-u"]],
          ["utf8-env-PYTHONUNBUFFERED", { ...U8, PYTHONUNBUFFERED: "1" }, []],
          ["rec-nocolor", REC_NOCOLOR, []],
        ]
      : [
          ["default", {}, []],
          ["rec-nocolor", REC_NOCOLOR, []],
        ];
    for (const [pn, pe, flags] of tickVariants) {
      for (let rep = 0; rep < 3; rep++) {
        await runCase(ctx, { id: `${L.tool}.tick.${pn}`, tool: L.tool, scenario: "tick", profile: pn, envDelta: pe, run: mk(["tick", "6"], pe, flags), tick: true, rep, markers: ["tick 6 "], timeoutMs: 90000 });
      }
    }
    // 5. interleave：stdout 与 stderr 的先后顺序
    const ilv = L.python ? [["default", {}, []], ["flag-u", {}, ["-u"]]] : [["default", {}, []]];
    for (const [pn, pe, flags] of ilv) {
      await runCase(ctx, { id: `${L.tool}.interleave50ms.${pn}`, tool: L.tool, scenario: "interleave-50ms", profile: pn, run: mk(["interleave", "20", "50"], pe, flags), order: true, markers: ["seq 20 err"], rep: 0 });
      for (let rep = 0; rep < 3; rep++) {
        await runCase(ctx, { id: `${L.tool}.interleave0ms.${pn}`, tool: L.tool, scenario: "interleave-tight", profile: pn, run: mk(["interleave", "400", "0"], pe, flags), order: true, markers: ["seq 400 err"], rep });
      }
    }
    // 5b. bulk：2 万行带颜色码的中文，数据块边界必然切在汉字和转义序列中间；hard = 写完立刻硬退出，看尾部丢不丢
    const bulkV = L.python ? [["utf8-buffered", U8, []], ["utf8-flag-u", U8, ["-u"]]] : [["default", {}, []]];
    for (const [pn, pe, flags] of bulkV) {
      for (const mode of ["soft", "hard"]) {
        await runCase(ctx, { id: `${L.tool}.bulk-${mode}.${pn}`, tool: L.tool, scenario: `bulk-${mode}`, profile: pn, envDelta: pe, run: mk(["bulk", "20000", mode], pe, flags), bulk: 20000, markers: [], timeoutMs: 120000 });
      }
    }
    // 6. hang：打印 5 行后被强杀，看丢不丢
    const hang = L.python ? [["default", {}, []], ["utf8-buffered", U8, []], ["utf8-flag-u", U8, ["-u"]], ["utf8-env-PYTHONUNBUFFERED", { ...U8, PYTHONUNBUFFERED: "1" }, []]] : [["default", {}, []]];
    for (const [pn, pe, flags] of hang) {
      await runCase(ctx, {
        id: `${L.tool}.hang-kill.${pn}`, tool: L.tool, scenario: "force-kill", profile: pn, envDelta: pe, run: mk(["hang", "5"], pe, flags),
        markers: ["line 1 before-kill", "line 5 before-kill 中文"], force: true, timeoutMs: 60000,
        drive: async (h) => {
          await sleep(L.killAfter);
          return { killedAfterMs: L.killAfter };
        },
      });
    }
  }
}
