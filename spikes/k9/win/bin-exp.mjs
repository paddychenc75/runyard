// K9b 实验 2：不用原生 Node 模块，把文件夹送进回收站；以及“绝不静默永久删除”的验证。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import * as G from "../lib/guard.mjs";
import { makeTree, fingerprint, countEntries } from "../lib/make-tree.mjs";
import { now, round, run, ps } from "./util.mjs";

export const F = { ALLOWUNDO: 0x40, NOCONFIRMATION: 0x10, SILENT: 0x4, NOERRORUI: 0x400, WANTNUKEWARNING: 0x4000, RECYCLEONDELETE: 0x80000, EARLYFAILURE: 0x100000 };
const hex = (n) => n.toString(16);

export function binInfo(drive) {
  const who = run("whoami", ["/user", "/fo", "csv", "/nh"]).stdout.trim();
  const sid = who.split(",")[1].replace(/"/g, "").trim();
  return { sid, dir: `${drive}\\$Recycle.Bin\\${sid}` };
}

function readI(file) {
  const b = fs.readFileSync(file);
  const ver = Number(b.readBigInt64LE(0));
  const size = Number(b.readBigInt64LE(8));
  let p;
  if (ver === 2) {
    const len = b.readInt32LE(24);
    p = b.slice(28, 28 + len * 2).toString("utf16le").replace(/\0.*$/, "");
  } else p = b.slice(24).toString("utf16le").replace(/\0.*$/, "");
  return { ver, size, original: p };
}
export function binEntries(bin) {
  let names = [];
  try {
    names = fs.readdirSync(bin.dir);
  } catch (e) {
    return { err: e.code, items: [] };
  }
  const items = [];
  for (const n of names) {
    if (!n.startsWith("$I")) continue;
    try {
      items.push({ id: n.slice(2), i: path.join(bin.dir, n), r: path.join(bin.dir, "$R" + n.slice(2)), ...readI(path.join(bin.dir, n)) });
    } catch {}
  }
  return { items };
}
const norm = (p) => p.replace(/^\\\\\?\\/, "").toLowerCase();

/** 候选实现。每个返回 {status, ms, out}，本身不判断结果，由 outcome() 看磁盘 */
export function candidates(helperExe, npmTrashJs) {
  const q = (s) => s.replace(/'/g, "''");
  const c = {
    "ps-visualbasic": (p) => ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${q(p)}','OnlyErrorDialogs','SendToRecycleBin')`, 45000),
    "ps-shell-application": (p) =>
      ps(`$sh=New-Object -ComObject Shell.Application; $i=$sh.NameSpace('${q(path.dirname(p))}').ParseName('${q(path.basename(p))}'); if($i -eq $null){Write-Output 'PARSE_NULL'; exit 3}; $i.InvokeVerb('delete'); Start-Sleep -Milliseconds 500`, 45000),
  };
  const add = (name, mode, flags) => (c[name] = (p) => run(helperExe, [mode, hex(flags), p], { timeout: 45000 }));
  add("exe-sh-quiet(UNDO|NOCONFIRM|SILENT|NOERRORUI)", "sh", F.ALLOWUNDO | F.NOCONFIRMATION | F.SILENT | F.NOERRORUI);
  add("exe-sh-confirm(UNDO|SILENT|NOERRORUI|WANTNUKEWARNING)", "sh", F.ALLOWUNDO | F.SILENT | F.NOERRORUI | F.WANTNUKEWARNING);
  add("exe-ifo-quiet(UNDO|NOCONFIRM|SILENT|NOERRORUI)", "ifo", F.ALLOWUNDO | F.NOCONFIRMATION | F.SILENT | F.NOERRORUI);
  add("exe-ifo-recycle(UNDO|SILENT|NOERRORUI|RECYCLEONDELETE)", "ifo", F.ALLOWUNDO | F.SILENT | F.NOERRORUI | F.RECYCLEONDELETE);
  add("exe-ifo-recycle-noconfirm(+NOCONFIRM)", "ifo", F.ALLOWUNDO | F.NOCONFIRMATION | F.SILENT | F.NOERRORUI | F.RECYCLEONDELETE);
  add("exe-ifo-recycle-early(+EARLYFAILURE)", "ifo", F.ALLOWUNDO | F.NOCONFIRMATION | F.SILENT | F.NOERRORUI | F.RECYCLEONDELETE | F.EARLYFAILURE);
  if (npmTrashJs) c["npm-trash@10.1.1(windows-trash.exe)"] = (p) => run(process.execPath, [npmTrashJs, p], { timeout: 45000 });
  return c;
}

/** 看磁盘判结果：recycled / PERMANENTLY-DELETED / failed-safe / partial。
 * 按“新出现的 $I 记录里原路径的最后一段 == 目标名”匹配（名字带随机串，唯一；
 * 不比较整条路径，因为回收站可能记录短路径或不同写法）。 */
export function outcome(bin, before, target) {
  const exists = fs.existsSync(target);
  const after = binEntries(bin).items;
  const beforeIds = new Set(before.map((x) => x.id));
  const anyFresh = after.filter((x) => !beforeIds.has(x.id));
  const leaf = path.basename(target).toLowerCase();
  const fresh = anyFresh.filter((x) => path.basename(x.original.replace(/\\/g, "/")).toLowerCase() === leaf);
  let verdict;
  if (!exists && fresh.length) verdict = "recycled";
  else if (!exists && !fresh.length) verdict = "PERMANENTLY-DELETED";
  else if (exists && !anyFresh.length) verdict = "failed-safe(folder intact)";
  else verdict = "partial(folder still there, bin has new entries)";
  return { verdict, entry: fresh[0] || null, freshOriginals: anyFresh.map((x) => x.original).slice(0, 3) };
}

function sampleHash(dir) {
  const f = [path.join(dir, "说明 文档.md"), path.join(dir, "big0.bin"), path.join(dir, "node_modules", "pkg-0", "lib", "dist", "f0.js")];
  return f.map((x) => {
    try {
      return crypto.createHash("sha256").update(fs.readFileSync(x)).digest("hex").slice(0, 12);
    } catch (e) {
      return e.code;
    }
  });
}

/** 从回收站还原：把 $R 改名回原位（资源管理器“还原”做的就是这个），再比对 */
function restore(entry, target, expect) {
  try {
    fs.renameSync(entry.r, target);
  } catch (e) {
    return { restored: false, err: e.code };
  }
  try {
    fs.unlinkSync(entry.i);
  } catch {}
  const same = JSON.stringify(sampleHash(target)) === JSON.stringify(expect.hash) && JSON.stringify(countEntries(target)) === JSON.stringify(expect.count);
  return { restored: true, intact: same };
}

export function buildCase(root, kind, files) {
  const name = G.newName(kind);
  const dir = path.join(root, name);
  if (kind === "longpath") {
    makeTree(dir, { files: 20, symlinks: false, xattrs: false, bigMB: 0, deep: false });
    let deep = dir;
    for (let i = 0; i < 12; i++) deep = path.join(deep, `segment-${i}-0123456789abcdef`);
    G.assertInRoot(deep);
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "deep.txt"), "deep\n");
    return { dir, deepLen: path.join(deep, "deep.txt").length };
  }
  makeTree(dir, { files, symlinks: false, xattrs: false, bigMB: kind === "big" ? 8 : 1, deep: kind === "deepish" });
  return { dir };
}

let VKEY = null;
export const setVolumeKey = (k) => (VKEY = k);

/**
 * 预检：这是“绝不静默永久删除”的真正保证（外壳的任何标志组合都挡不住，见 README）。
 * 返回 {ok, reasons}。reasons 非空就必须拒绝，向用户报 PATH_NOT_RECYCLABLE 一类的错误码。
 */
export function preflight(dir) {
  const reasons = [];
  let maxLen = 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      maxLen = Math.max(maxLen, p.length);
      if (e.isDirectory()) stack.push(p);
      else {
        try {
          total += fs.lstatSync(p).size;
        } catch {}
      }
    }
  }
  // 外壳回收站不接受 >= MAX_PATH(260) 的路径；目录要给文件名留位置，所以目录阈值更小。保守取 248。
  if (maxLen >= 248) reasons.push(`PATH_TOO_LONG(${maxLen})`);
  if (VKEY) {
    const cap = regGet(VKEY, "MaxCapacity");
    const nuke = regGet(VKEY, "NukeOnDelete");
    if (nuke && parseInt(nuke, 16) === 1) reasons.push("BIN_DISABLED(NukeOnDelete)");
    if (cap && total > parseInt(cap, 16) * 1024 * 1024) reasons.push(`TOO_BIG_FOR_BIN(${Math.round(total / 1048576)}MB>${parseInt(cap, 16)}MB)`);
  }
  for (const k of ["HKLM", "HKCU"]) {
    const v = regGet(`${k}\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer`, "NoRecycleFiles");
    if (v && parseInt(v, 16) === 1) reasons.push(`BIN_DISABLED_BY_POLICY(${k})`);
  }
  return { ok: reasons.length === 0, reasons, maxPathLen: maxLen, totalBytes: total };
}

/** 跑一个候选 × 一个场景 */
export function trial(root, bin, name, fn, kind, files, usePrefix = false) {
  const { dir, deepLen } = buildCase(root, kind, files);
  const hash = sampleHash(dir);
  const count = countEntries(dir);
  const pre = preflight(dir);
  const before = binEntries(bin).items;
  const target = usePrefix ? "\\\\?\\" + dir : dir;
  const t0 = now();
  const r = fn(target);
  const ms = round(now() - t0);
  const oc = outcome(bin, before, dir);
  const res = { cand: name, kind, ms, status: r.status, signal: r.signal || undefined, out: ((r.stdout || "") + (r.stderr || "")).trim().replace(/\s+/g, " ").slice(0, 400), verdict: oc.verdict, deepLen, preflight: pre.ok ? "pass" : pre.reasons.join("+"), binNew: oc.verdict === 'PERMANENTLY-DELETED' ? oc.freshOriginals : undefined };
  if (oc.entry) {
    res.binSize = oc.entry.size;
    if (kind !== "longpath") res.restore = restore(oc.entry, dir, { hash, count });
    else {
      // 超长路径场景：还原后看最深处的文件还在不在
      try {
        fs.renameSync(oc.entry.r, dir);
        let deep = dir;
        for (let i = 0; i < 12; i++) deep = path.join(deep, `segment-${i}-0123456789abcdef`);
        res.restore = { restored: true, deepFileIntact: fs.existsSync(path.join(deep, "deep.txt")) && fs.readFileSync(path.join(deep, "deep.txt"), "utf8") === "deep\n" };
        try { fs.unlinkSync(oc.entry.i); } catch {}
      } catch (e) {
        res.restore = { restored: false, err: e.code };
      }
    }
  }
  // 清理这一轮留下的东西（都在临时根内）
  try {
    if (fs.existsSync(dir)) G.removeInRoot(dir);
  } catch (e) {
    res.cleanupErr = e.code;
  }
  return res;
}

/** 每个卷的回收站配置：容量上限（MB）、是否“不要移到回收站” */
export function volumeKey(drive) {
  const r = ps(`(Get-Volume -DriveLetter '${drive[0]}').UniqueId`);
  const m = r.stdout.match(/Volume(\{[0-9a-fA-F-]+\})/);
  return m ? `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume\\${m[1]}` : null;
}
export const regGet = (key, name) => {
  const r = run("reg", ["query", key, "/v", name]);
  return r.status === 0 ? r.stdout.trim().split(/\s+/).pop() : null;
};
export const regSet = (key, name, v) => run("reg", ["add", key, "/v", name, "/t", "REG_DWORD", "/d", String(v), "/f"]);
export const regDel = (key, name) => run("reg", ["delete", key, "/v", name, "/f"]);

/** 诊断：运行器上的回收站到底能不能用？（第一轮所有候选都“永久删除”，需要查原因） */
export function diagnose(root, bin, drive, helperExe) {
  const out = {};
  const sh = (cmd) => run("cmd.exe", ["/c", cmd]).stdout.trim().slice(0, 1500);
  out.session = ps("[Environment]::UserInteractive; (Get-Process explorer -ErrorAction SilentlyContinue | Measure-Object).Count; (Get-Process -Id $PID).SessionId").stdout.trim().replace(/\s+/g, " ");
  out.regHKCU = sh("reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket /s");
  out.regHKLM = sh("reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket /s");
  out.policyHKLM = sh("reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer");
  out.policyHKCU = sh("reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer");
  out.binDirTop = sh(`dir /a ${drive}\\$Recycle.Bin`);
  out.binDirMine = sh(`dir /a "${bin.dir}"`);
  out.queryRecycleBin = ps(`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class RB{[StructLayout(LayoutKind.Sequential)]public struct Q{public int cb;public long size;public long n;}[DllImport("shell32.dll",CharSet=CharSet.Unicode)]public static extern int SHQueryRecycleBinW(string p,ref Q q);}'; $q=New-Object RB+Q; $q.cb=[Runtime.InteropServices.Marshal]::SizeOf($q); $rc=[RB]::SHQueryRecycleBinW('${drive}\\',[ref]$q); "rc=$rc size=$($q.size) items=$($q.n)"`).stdout.trim();
  // 小文件夹试一次，然后看回收站目录里有没有东西
  const tiny = path.join(root, G.newName("diag"));
  makeTree(tiny, { files: 3, symlinks: false, xattrs: false, bigMB: 0, deep: false });
  const before = binEntries(bin).items;
  const r = ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${tiny}','OnlyErrorDialogs','SendToRecycleBin')`, 45000);
  // 对照：放在系统临时目录里的小文件夹，同样的调用
  const tmpDir = path.join(os.tmpdir(), G.newName("difftmp"));
  fs.mkdirSync(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "a.txt"), "x");
  const b2 = binEntries(bin).items;
  ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${tmpDir}','OnlyErrorDialogs','SendToRecycleBin')`, 45000);
  out.tinyVBInSystemTemp = outcome(bin, b2, tmpDir).verdict;
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); // 刚用 mkdir 建的、名字带唯一前缀的目录
  out.psListBin = ps(`Get-ChildItem -Force '${bin.dir}' | Select-Object Name,Length | Format-Table -HideTableHeaders | Out-String`).stdout.trim().slice(0, 500);
  out.tinyVB = { status: r.status, verdict: outcome(bin, before, tiny).verdict, binAfter: sh(`dir /a /s "${bin.dir}"`).slice(0, 600) };
  if (fs.existsSync(tiny)) G.removeInRoot(tiny);
  return out;
}

/** 找“路径多长时外壳开始静默永久删除”：造一个文件全路径长度恰为 L 的小目录，用安静的标志组合送回收站，看结果。 */
export function pathLengthScan(root, bin, fn, lengths) {
  const out = [];
  for (const L of lengths) {
    const dir = path.join(root, G.newName("scan"));
    G.assertInRoot(dir);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, G.MARKER), G.token() + "\n");
    let cur = dir;
    const fileName = "deep.txt";
    // 一段一段往下加，最后一段补齐到总长 L
    while (path.join(cur, fileName).length + 21 < L) cur = path.join(cur, "seg-0123456789abcdef");
    const remain = L - path.join(cur, fileName).length - 1;
    if (remain >= 1) cur = path.join(cur, "x".repeat(remain));
    fs.mkdirSync(cur, { recursive: true });
    const f = path.join(cur, fileName);
    fs.writeFileSync(f, "payload-" + L + "\n");
    const before = binEntries(bin).items;
    const t0 = now();
    const r = fn(dir);
    const ms = round(now() - t0);
    const oc = outcome(bin, before, dir);
    const row = { fileLen: f.length, ms, status: r.status, verdict: oc.verdict, out: ((r.stdout || '') + (r.stderr || '')).trim().replace(/\s+/g, ' ').slice(-200) || undefined };
    if (oc.entry) {
      row.binSize = oc.entry.size;
      try {
        fs.renameSync(oc.entry.r, dir);
        row.restored = fs.existsSync(f) && fs.readFileSync(f, "utf8") === "payload-" + L + "\n";
        try { fs.unlinkSync(oc.entry.i); } catch {}
      } catch (e) {
        row.restoreErr = e.code;
      }
    }
    try { if (fs.existsSync(dir)) G.removeInRoot(dir); } catch (e) { row.cleanupErr = e.code; }
    out.push(row);
  }
  return out;
}
