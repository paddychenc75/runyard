// K9a 实验主程序。用法：node mac/run.mjs [--ci] [--label <名字>] [--files N] [--skip-volumes]
// --ci：额外跑会弹权限框的变体（osascript 调 Finder）。只应在 CI 运行器上用，不要在个人电脑上用。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import * as G from "../lib/guard.mjs";
import { makeTree, fingerprint, countEntries } from "../lib/make-tree.mjs";
import { trashByRename, restoreByRename, copyThenDelete, mountPointOf } from "../lib/trash-mac.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const CI = flag("--ci");
const LABEL = opt("--label", CI ? "ci" : "local");
const FILES = Number(opt("--files", 30000));
const HOME_TRASH = path.join(os.homedir(), ".Trash");

const ROOT = G.makeRoot();
const results = { label: LABEL, node: process.version, os: null, files: FILES, exps: {} };
const startedPids = new Set();
const mounts = []; // { mp, dev, img }
const ms = (t0) => Math.round((performance.now() - t0) * 100) / 100;
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: "utf8", timeout: 120000, ...o });
const log = (...a) => console.log("[k9]", ...a);

async function exp(name, fn) {
  log("==", name);
  try {
    results.exps[name] = await fn();
  } catch (e) {
    results.exps[name] = { error: String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e) };
  }
  log(JSON.stringify(results.exps[name]).slice(0, 600));
}
const errInfo = (e) => ({ code: e.code, step: e.step, msg: String(e.message).slice(0, 160) });

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- 0. 环境 ----------
results.os = {
  sw_vers: sh("sw_vers", []).stdout.trim().replace(/\s+/g, " "),
  arch: process.arch,
  uid: process.getuid(),
  term: process.env.TERM_PROGRAM || null,
  ci: !!process.env.CI,
  trashBinary: sh("which", ["trash"]).stdout.trim() || null,
  swiftc: sh("xcrun", ["--find", "swiftc"]).stdout.trim() || null,
};

// ---------- 2. 权限（先做，用最小的文件夹） ----------
await exp("tcc-home-trash", () => {
  const r = {};
  const tryit = (k, f) => {
    try {
      const v = f();
      r[k] = v === undefined ? "ok" : v;
    } catch (e) {
      r[k] = `ERR ${e.code}`;
    }
  };
  tryit("stat ~/.Trash", () => fs.statSync(HOME_TRASH).mode.toString(8));
  tryit("readdir ~/.Trash", () => `ok(${fs.readdirSync(HOME_TRASH).length} entries)`);
  tryit("access W_OK", () => fs.accessSync(HOME_TRASH, fs.constants.W_OK));
  // 往里 mkdir + rename 一个最小文件夹
  const d = path.join(ROOT, G.newName("tcc"));
  makeTree(d, { files: 3, xattrs: false, bigMB: 0 });
  tryit("trashByRename(tiny)", () => {
    const x = trashByRename(d);
    G.registerTrashed(x.dest);
    r.tinyDest = x.dest;
  });
  tryit("readdir after (names only own)", () => fs.readdirSync(HOME_TRASH).filter((n) => n.startsWith(G.PREFIX)).join(","));
  return r;
});

// ---------- 1/4/5. 30000 文件：rename 进 ~/.Trash、还原、重复 ----------
await exp("rename-30k-home", () => {
  const name = G.newName("tree");
  const proj = path.join(ROOT, name);
  let t0 = performance.now();
  makeTree(proj, { files: FILES });
  const genMs = ms(t0);
  const before = fingerprint(proj);
  const cnt = countEntries(proj);
  const runs = [];
  let last;
  for (let i = 0; i < 5; i++) {
    t0 = performance.now();
    const x = trashByRename(proj);
    const tTrash = ms(t0);
    G.registerTrashed(x.dest);
    const gone = !fs.existsSync(proj);
    const there = fs.existsSync(path.join(x.dest, G.MARKER));
    t0 = performance.now();
    restoreByRename(x.dest, proj);
    G.unregisterTrashed(x.dest);
    const tRestore = ms(t0);
    runs.push({ trashMs: tTrash, restoreMs: tRestore, gone, there, method: x.method });
    last = x;
  }
  const after = fingerprint(proj);
  const cnt2 = countEntries(proj);
  // 最后再放进去一次，留着在 Finder 里看（结束时统一清理）
  const fin = trashByRename(proj);
  G.registerTrashed(fin.dest);
  return { genMs, counts: cnt, runs, fingerprintEqual: same(before, after), countsEqual: same(cnt, cnt2), leftoverDest: fin.dest };
});

// ---------- 2b. 重名处理 ----------
await exp("collisions", () => {
  const out = { names: [] };
  const base = G.newName("dup");
  for (let i = 0; i < 4; i++) {
    const parent = path.join(ROOT, `p${i}`);
    fs.mkdirSync(parent);
    const d = path.join(parent, base);
    makeTree(d, { files: 2, xattrs: false, bigMB: 0 });
    const x = trashByRename(d);
    G.registerTrashed(x.dest);
    out.names.push(path.basename(x.dest).replace(base, "<NAME>"));
  }
  // 重名且带扩展名的文件
  const fbase = G.newName("file") + ".txt";
  for (let i = 0; i < 2; i++) {
    const f = path.join(ROOT, `p${i}`, fbase);
    fs.writeFileSync(f, "x");
    // 文件不带标记文件，登记时用特殊处理：只放文件，下面单独清理
    const x = trashByRename(f);
    out.names.push(path.basename(x.dest).replace(fbase.slice(0, -4), "<FILE>"));
    out.fileDests = [...(out.fileDests || []), x.dest];
  }
  // 对照：朴素 rename 到已存在的空目录上，会静默覆盖吗？（在临时根里演示，不碰废纸篓）
  const a = path.join(ROOT, "naive-a");
  const b = path.join(ROOT, "naive-b");
  fs.mkdirSync(a);
  fs.writeFileSync(path.join(a, "f"), "1");
  fs.mkdirSync(b);
  try {
    fs.renameSync(a, b);
    out.naiveRenameOverEmptyDir = "静默成功（会覆盖同名空目录）";
  } catch (e) {
    out.naiveRenameOverEmptyDir = e.code;
  }
  const c = path.join(ROOT, "naive-c");
  fs.mkdirSync(c);
  fs.writeFileSync(path.join(c, "f"), "1");
  fs.mkdirSync(path.join(ROOT, "naive-d"));
  fs.writeFileSync(path.join(ROOT, "naive-d", "g"), "2");
  try {
    fs.renameSync(c, path.join(ROOT, "naive-d"));
    out.naiveRenameOverNonEmptyDir = "成功?!";
  } catch (e) {
    out.naiveRenameOverNonEmptyDir = e.code;
  }
  return out;
});

// ---------- 1. 文件夹是符号链接 ----------
await exp("symlink-folder", () => {
  const target = path.join(ROOT, "real-target");
  makeTree(target, { files: 5, xattrs: false, bigMB: 0 });
  const link = path.join(ROOT, G.newName("link"));
  fs.symlinkSync(target, link);
  const x = trashByRename(link);
  G.registerTrashed(x.dest);
  return {
    dest: path.basename(x.dest),
    destIsSymlink: fs.lstatSync(x.dest).isSymbolicLink(),
    targetIntact: fs.existsSync(path.join(target, G.MARKER)),
    linkGone: !fs.existsSync(link) && (() => { try { fs.lstatSync(link); return false; } catch { return true; } })(),
  };
});

// ---------- 1. 正在使用的文件夹：进程 cwd 和打开的文件句柄 ----------
await exp("busy-folder", () => {
  const proj = path.join(ROOT, G.newName("busy"));
  makeTree(proj, { files: 50, xattrs: false, bigMB: 0 });
  fs.writeFileSync(path.join(proj, "log.txt"), "line\n");
  const p1 = spawn("sleep", ["600"], { cwd: proj, stdio: "ignore" });
  const p2 = spawn("tail", ["-f", path.join(proj, "log.txt")], { stdio: "ignore" });
  startedPids.add(p1.pid);
  startedPids.add(p2.pid);
  execFileSync("sleep", ["0.5"]);
  const x = trashByRename(proj);
  G.registerTrashed(x.dest);
  const alive = (p) => { try { process.kill(p.pid, 0); return true; } catch { return false; } };
  const lsof = sh("lsof", ["-p", String(p1.pid), "-a", "-d", "cwd", "-Fn"]).stdout.split("\n").filter((l) => l.startsWith("n"))[0];
  const lsof2 = sh("lsof", ["-p", String(p2.pid), "-Fn"]).stdout.split("\n").filter((l) => l.includes("log.txt"))[0];
  const res = { renameOk: !fs.existsSync(proj), cwdProcAlive: alive(p1), handleProcAlive: alive(p2), cwdNow: lsof && lsof.replace(os.homedir(), "~"), handleNow: lsof2 && lsof2.replace(os.homedir(), "~") };
  p1.kill();
  p2.kill();
  startedPids.delete(p1.pid);
  startedPids.delete(p2.pid);
  return res;
});

// ---------- 1/4. 其他卷：磁盘映像 ----------
function mountImage(fsName, sizeMB) {
  const img = path.join(ROOT, `img-${fsName}-${mounts.length}.dmg`);
  G.assertInRoot(img);
  const vol = `RYK9${fsName.replace(/\W/g, "").slice(0, 4)}`;
  let r = sh("hdiutil", ["create", "-size", `${sizeMB}m`, "-fs", fsName, "-volname", vol, "-type", "UDIF", img]);
  if (r.status !== 0) return { err: `create: ${(r.stderr || r.stdout).trim().slice(0, 200)}` };
  const mp = path.join(ROOT, `mnt-${fsName.replace(/\W/g, "")}-${mounts.length}`);
  fs.mkdirSync(mp);
  r = sh("hdiutil", ["attach", img, "-nobrowse", "-noautoopen", "-noverify", "-mountpoint", mp]);
  if (r.status !== 0) return { err: `attach: ${(r.stderr || r.stdout).trim().slice(0, 200)}` };
  const dev = r.stdout.split("\n")[0].split(/\s+/)[0];
  mounts.push({ mp, dev, img });
  return { mp, dev, img };
}
function detach(m) {
  let r = sh("hdiutil", ["detach", m.dev]);
  if (r.status !== 0) r = sh("hdiutil", ["detach", "-force", m.dev]);
  return r.status === 0;
}

const volumeExp = (fsName, sizeMB, files, full) => () => {
  const m = mountImage(fsName, sizeMB);
  if (m.err) return m;
  const out = { mount: m.dev };
  const trashesBefore = (() => { try { return fs.statSync(path.join(m.mp, ".Trashes")).mode.toString(8); } catch (e) { return e.code; } })();
  out.trashesDirBefore = trashesBefore;
  const mpRoot = fs.realpathSync(m.mp);
  const proj = path.join(mpRoot, G.newName("vol"));
  let t0 = performance.now();
  makeTree(proj, { files, symlinks: full, xattrs: full, bigMB: full ? 8 : 1 });
  out.genMs = ms(t0);
  const sha = (d) => Object.fromEntries(Object.entries(fingerprint(d)).map(([k, v]) => [k, v && v.sha ? v.sha : v && v.link]));
  const before = full ? fingerprint(proj) : sha(proj);
  const cnt = countEntries(proj);
  // 1) 卷内 .Trashes/<uid> 的 rename
  try {
    t0 = performance.now();
    const x = trashByRename(proj);
    out.volRename = { ms: ms(t0), dest: path.relative(mpRoot, x.dest), method: x.method };
    out.trashesDirAfter = fs.statSync(path.join(mpRoot, ".Trashes")).mode.toString(8);
    out.trashesUidDir = fs.statSync(path.join(mpRoot, ".Trashes", String(process.getuid()))).mode.toString(8);
    t0 = performance.now();
    restoreByRename(x.dest, proj);
    out.volRename.restoreMs = ms(t0);
    const after = full ? fingerprint(proj) : sha(proj);
    out.volRename.restoredIntact = same(before, after) && same(cnt, countEntries(proj));
  } catch (e) {
    out.volRename = errInfo(e);
  }
  // 2) 强制走“复制到 ~/.Trash 再删原件”
  try {
    t0 = performance.now();
    const x = copyThenDelete(proj, HOME_TRASH, true);
    out.copyDelete = { ms: ms(t0), srcGone: !fs.existsSync(proj), dest: path.basename(x.dest).slice(0, 40) };
    G.registerTrashed(x.dest);
    const copied = countEntries(x.dest);
    out.copyDelete.countsEqual = same(cnt, copied);
    // 复制后的内容和原来一致吗（符号链接、模式；扩展属性不会被 fs.cp 带走）
    t0 = performance.now();
    fs.renameSync(x.dest, proj); // 注意：这是跨卷，会 EXDEV
    out.copyDelete.backByRename = "unexpected-success";
  } catch (e) {
    if (out.copyDelete) {
      out.copyDelete.backByRename = e.code;
      const dest = G.registeredTrashed().find((p) => path.basename(p).startsWith(path.basename(proj)));
      if (dest && fs.existsSync(dest)) {
        const copiedFp = full ? fingerprint(dest) : sha(dest);
        out.copyDelete.fingerprintDiff = Object.keys(copiedFp).filter((k) => !same(copiedFp[k], before[k]));
      }
    } else out.copyDelete = errInfo(e);
  }
  return out;
};

if (!flag("--skip-volumes")) {
  await exp("volume-apfs", volumeExp("APFS", 600, FILES, true));
  await exp("volume-exfat", volumeExp("ExFAT", 300, 3000, false));
  await exp("volume-fat", volumeExp("MS-DOS", 300, 3000, false));

  // 复制兜底的失败安全：源里放一个不可读的文件 → 复制必须失败，原件原样保留，没有半成品
  await exp("copy-failure-safety", () => {
    // exFAT 不支持 chmod 000，用 APFS 的不可读文件
    const m2 = mountImage("APFS", 100);
    if (m2.err) return m2;
    const mp2 = fs.realpathSync(m2.mp);
    const p2 = path.join(mp2, G.newName("fail"));
    makeTree(p2, { files: 200, xattrs: false, bigMB: 1 });
    fs.chmodSync(path.join(p2, "node_modules", "pkg-3", "lib", "dist", "f5.js"), 0o000);
    const beforeCnt = countEntries(p2);
    let res;
    try {
      copyThenDelete(p2, HOME_TRASH, true);
      res = { unexpected: "复制竟然成功" };
    } catch (e) {
      res = { failed: errInfo(e), srcIntact: same(beforeCnt, countEntries(p2)), srcMarker: fs.existsSync(path.join(p2, G.MARKER)) };
    }
    // 废纸篓里不该留下半成品
    // ~/.Trash 不能列目录，所以按预期的名字逐个 stat
    const leftovers = [path.basename(p2), path.basename(p2) + ".runyard-partial"].filter((n) => fs.existsSync(path.join(HOME_TRASH, n)));
    res.trashLeftovers = leftovers;
    return res;
  });
}

// ---------- 3/4. “放回原处”与替代实现 ----------
function putBackEvidence(destName, origParent) {
  const ds = path.join(HOME_TRASH, ".DS_Store");
  try {
    const buf = fs.readFileSync(ds);
    const u16 = Buffer.from(destName, "utf16le").swap16();
    const parent = Buffer.from(origParent.replace(/^\//, ""), "utf16le").swap16();
    return { dsStoreReadable: true, size: buf.length, hasPtbL: buf.includes("ptbL"), hasPtbN: buf.includes("ptbN"), hasName: buf.includes(u16), hasOrigParent: buf.includes(parent) };
  } catch (e) {
    return { dsStoreReadable: false, err: e.code };
  }
}
async function altMethod(label, run) {
  await exp(`alt-${label}`, async () => {
    const name = G.newName(label);
    const proj = path.join(ROOT, name);
    makeTree(proj, { files: FILES });
    const t0 = performance.now();
    const r = await run(proj);
    const dur = ms(t0);
    const dest = path.join(HOME_TRASH, name);
    const gone = !fs.existsSync(proj);
    let found = fs.existsSync(dest);
    if (found) G.registerTrashed(dest);
    let evidence;
    for (let i = 0; i < 10; i++) {
      evidence = putBackEvidence(name, ROOT);
      if (evidence.hasName || !evidence.dsStoreReadable) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ms: dur, status: r.status, stderr: (r.stderr || "").slice(0, 300), stdout: (r.stdout || "").trim().slice(0, 200).replace(os.homedir(), "~"), gone, foundInHomeTrash: found, putBack: evidence };
  });
}

await exp("baseline-rename-putback-evidence", () => {
  const name = G.newName("base");
  const proj = path.join(ROOT, name);
  makeTree(proj, { files: 10, xattrs: false, bigMB: 0 });
  const x = trashByRename(proj);
  G.registerTrashed(x.dest);
  return putBackEvidence(name, ROOT);
});

if (results.os.trashBinary) {
  await altMethod("usrbintrash", (p) => sh(results.os.trashBinary, ["-v", p]));
}

let helperBin = null;
if (results.os.swiftc && (CI || flag("--swift"))) {
  await exp("swift-compile", () => {
    helperBin = path.join(ROOT, "trash-helper");
    const t0 = performance.now();
    const r = sh("swiftc", ["-O", path.join(import.meta.dirname, "trash-helper.swift"), "-o", helperBin], { timeout: 300000 });
    const st = fs.existsSync(helperBin) ? fs.statSync(helperBin).size : 0;
    return { status: r.status, ms: ms(t0), bytes: st, err: (r.stderr || "").slice(0, 200) };
  });
  if (helperBin && fs.existsSync(helperBin)) await altMethod("swifthelper", (p) => sh(helperBin, [p]));
}

// npm 包 trash@10.1.1 在 macOS 上用的是它随包带的预编译 Swift 小工具（lib/macos-trash）。对照用，不是推荐。
try {
  const { default: npmTrash } = await import("trash");
  await altMethod("npm-trash", async (p) => {
    try {
      await npmTrash(p, { glob: false });
      return { status: 0 };
    } catch (e) {
      return { status: 1, stderr: String(e) };
    }
  });
} catch (e) {
  results.exps["alt-npm-trash"] = { error: "import failed: " + e.code };
}

if (CI) {
  // 会弹“想要控制 Finder”的 Automation 权限框 → 只在 CI 运行器上试
  await altMethod("osascript-finder", (p) => sh("osascript", ["-e", `tell application "Finder" to delete POSIX file "${p}"`], { timeout: 180000 }));
  // 同名连续两次，看 Finder / trash / helper 各自怎么加后缀
  await exp("native-collision-naming", () => {
    const base = G.newName("ncol");
    const names = {};
    const tools = [["usrbintrash", (p) => sh(results.os.trashBinary || "trash", ["-v", p])]];
    if (helperBin) tools.push(["swifthelper", (p) => sh(helperBin, [p])]);
    tools.push(["finder", (p) => sh("osascript", ["-e", `tell application "Finder" to delete POSIX file "${p}"`], { timeout: 180000 })]);
    for (const [tn, run] of tools) {
      names[tn] = [];
      for (let i = 0; i < 2; i++) {
        const par = path.join(ROOT, `n-${tn}-${i}`);
        fs.mkdirSync(par);
        const d = path.join(par, base);
        makeTree(d, { files: 1, xattrs: false, bigMB: 0 });
        const r = run(d);
        const after = fs.readdirSync(HOME_TRASH).filter((n) => n.startsWith(base));
        names[tn].push(after.map((n) => n.replace(base, "<NAME>")));
        for (const n of after) G.registerTrashed(path.join(HOME_TRASH, n));
      }
    }
    return names;
  });
}

// ---------- 清理 ----------
const cleanup = { trashItemsRemoved: 0, errors: [] };
try {
  for (const p of G.registeredTrashed()) {
    try {
      // 名字加了时间后缀的条目：removeOwnTrashItem 内部核对前缀、登记和标记
      G.removeOwnTrashItem(p);
      cleanup.trashItemsRemoved++;
    } catch (e) {
      cleanup.errors.push(`${path.basename(p)}: ${e.message}`);
    }
  }
  for (const f of results.exps.collisions?.fileDests ?? []) {
    // 单文件条目：没有标记文件，按唯一前缀 + 精确路径删除
    if (path.basename(f).startsWith(G.PREFIX) && path.dirname(f) === HOME_TRASH && fs.existsSync(f)) {
      fs.unlinkSync(f);
      cleanup.trashItemsRemoved++;
    }
  }
} catch (e) {
  cleanup.errors.push(String(e));
}
for (const pid of startedPids) {
  try { process.kill(pid); } catch {}
}
for (const m of mounts.reverse()) {
  if (!detach(m)) cleanup.errors.push(`detach failed ${m.dev}`);
}
let leftover = [];
try {
  leftover = fs.readdirSync(HOME_TRASH).filter((n) => n.startsWith(G.PREFIX));
} catch (e) {
  leftover = [`(无法列出 ~/.Trash: ${e.code})`];
}
cleanup.homeTrashLeftoverWithPrefix = leftover;
cleanup.stillRegisteredExist = G.registeredTrashed().filter((p) => fs.existsSync(p));
// 删临时根
try {
  const real = fs.realpathSync(os.tmpdir());
  if (ROOT.startsWith(real + path.sep) && path.basename(ROOT).startsWith(G.PREFIX)) {
    const mpLeft = sh("mount", []).stdout.split("\n").filter((l) => l.includes(ROOT));
    if (mpLeft.length) cleanup.errors.push("根内仍有挂载，未删除根");
    else {
      G.removeRoot();
    }
  }
} catch (e) {
  cleanup.errors.push(String(e));
}
cleanup.rootGone = !fs.existsSync(ROOT);
results.cleanup = cleanup;
fs.mkdirSync(path.join(import.meta.dirname, "..", "results"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, "..", "results", `mac-${LABEL}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.cleanup, null, 2));
process.exit(cleanup.errors.length ? 1 : 0);
