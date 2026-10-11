// K9b 实验 2：不用原生 Node 模块，把文件夹送进回收站；以及“绝不静默永久删除”的验证。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

/** 看磁盘判结果：recycled / PERMANENTLY-DELETED / failed-safe / both */
export function outcome(bin, before, target) {
  const exists = fs.existsSync(target);
  const after = binEntries(bin).items;
  const beforeIds = new Set(before.map((x) => x.id));
  const fresh = after.filter((x) => !beforeIds.has(x.id) && norm(x.original) === norm(target));
  const anyFresh = after.filter((x) => !beforeIds.has(x.id));
  let verdict;
  if (!exists && fresh.length) verdict = "recycled";
  else if (!exists && !fresh.length) verdict = "PERMANENTLY-DELETED";
  else if (exists && !anyFresh.length) verdict = "failed-safe(folder intact)";
  else verdict = "partial(folder still there, bin has new entries)";
  return { verdict, entry: fresh[0] || null };
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
    makeTree(dir, { files: 20, symlinks: false, xattrs: false, bigMB: 0 });
    let deep = dir;
    for (let i = 0; i < 12; i++) deep = path.join(deep, `segment-${i}-0123456789abcdef`);
    G.assertInRoot(deep);
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "deep.txt"), "deep\n");
    return { dir, deepLen: path.join(deep, "deep.txt").length };
  }
  makeTree(dir, { files, symlinks: false, xattrs: false, bigMB: kind === "big" ? 8 : 1 });
  return { dir };
}

/** 跑一个候选 × 一个场景 */
export function trial(root, bin, name, fn, kind, files, usePrefix = false) {
  const { dir, deepLen } = buildCase(root, kind, files);
  const hash = sampleHash(dir);
  const count = countEntries(dir);
  const before = binEntries(bin).items;
  const target = usePrefix ? "\\\\?\\" + dir : dir;
  const t0 = now();
  const r = fn(target);
  const ms = round(now() - t0);
  const oc = outcome(bin, before, dir);
  const res = { cand: name, kind, ms, status: r.status, signal: r.signal || undefined, out: ((r.stdout || "") + (r.stderr || "")).trim().replace(/\s+/g, " ").slice(0, 400), verdict: oc.verdict, deepLen };
  if (oc.entry) {
    res.binSize = oc.entry.size;
    if (kind !== "longpath") res.restore = restore(oc.entry, dir, { hash, count });
    else res.restore = restore(oc.entry, dir, { hash: sampleHash(dir), count: countEntries(dir) });
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
  out.queryRecycleBin = ps(`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class RB{[StructLayout(LayoutKind.Sequential,Pack=1)]public struct Q{public int cb;public long size;public long n;}[DllImport("shell32.dll",CharSet=CharSet.Unicode)]public static extern int SHQueryRecycleBinW(string p,ref Q q);}'; $q=New-Object RB+Q; $q.cb=[Runtime.InteropServices.Marshal]::SizeOf($q); $rc=[RB]::SHQueryRecycleBinW('${drive}\\',[ref]$q); "rc=$rc size=$($q.size) items=$($q.n)"`).stdout.trim();
  // 小文件夹试一次，然后看回收站目录里有没有东西
  const tiny = path.join(root, G.newName("diag"));
  makeTree(tiny, { files: 3, symlinks: false, xattrs: false, bigMB: 0 });
  const before = binEntries(bin).items;
  const r = ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${tiny}','OnlyErrorDialogs','SendToRecycleBin')`, 45000);
  out.tinyVB = { status: r.status, verdict: outcome(bin, before, tiny).verdict, binAfter: sh(`dir /a /s "${bin.dir}"`).slice(0, 600) };
  if (fs.existsSync(tiny)) G.removeInRoot(tiny);
  return out;
}
