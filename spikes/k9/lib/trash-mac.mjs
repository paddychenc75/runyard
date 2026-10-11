// 候选实现：不依赖 Electron、不依赖原生模块的 macOS “移到废纸篓”。
// 做法：rename 进 ~/.Trash（同卷）或 <卷>/.Trashes/<uid>（别的卷）；
// 不列目录（~/.Trash 可能受隐私保护），重名靠“先 mkdir 占位再 rename 覆盖空目录”解决。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertInRoot, removeInRoot } from "./guard.mjs";

/** 找到 p 所在卷的挂载点：往上走，直到设备号变化 */
export function mountPointOf(p) {
  let cur = path.dirname(fs.realpathSync(path.dirname(p)));
  cur = fs.realpathSync(path.dirname(p));
  const dev = fs.statSync(cur).dev;
  for (;;) {
    const parent = path.dirname(cur);
    if (parent === cur || fs.statSync(parent).dev !== dev) return cur;
    cur = parent;
  }
}

/** Finder 的重名约定：在扩展名之前加 " HH.MM.SS"（见 README 对此的核实情况） */
export function finderSuffixName(name, now = new Date()) {
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map((x) => String(x).padStart(2, "0")).join(".");
  const ext = path.extname(name);
  const stem = ext && ext !== name ? name.slice(0, -ext.length) : name;
  return `${stem} ${t}${ext && ext !== name ? ext : ""}`;
}

/**
 * 原子占位：目录用 mkdir（EEXIST 即被占用），文件和符号链接用 open(wx)。
 * 为什么不直接 rename：rename 目录到一个已存在的“空目录”上会静默覆盖，不会报 EEXIST。
 */
function claim(target, isDir) {
  if (isDir) fs.mkdirSync(target);
  else fs.closeSync(fs.openSync(target, "wx"));
}

/**
 * @param {string} src 要移走的路径（调用方保证在临时根内；此处再断言一次）
 * @param {{trashDir?:string, uid?:number, allowCopyFallback?:boolean, now?:()=>Date}} o
 * @returns {{dest:string, method:string, collisions:number}}
 */
export function trashByRename(src, o = {}) {
  assertInRoot(src);
  const st = fs.lstatSync(src);
  const isDir = st.isDirectory(); // 符号链接按“文件”处理：移动链接本身，不跟随
  const uid = o.uid ?? process.getuid();
  const homeTrash = o.trashDir ?? path.join(os.homedir(), ".Trash");
  const homeDev = fs.statSync(path.dirname(homeTrash)).dev;
  const srcDev = st.dev; // lstat 的设备号：链接本身所在的卷
  let trashDir = homeTrash;
  let method = "rename-home";
  if (srcDev !== homeDev) {
    const mp = mountPointOf(src);
    trashDir = path.join(mp, ".Trashes", String(uid));
    method = "rename-volume";
    try {
      ensureVolumeTrash(path.dirname(trashDir), trashDir);
    } catch (e) {
      if (!o.allowCopyFallback) throw Object.assign(new Error(`无法创建卷废纸篓 ${trashDir}: ${e.code}`), { code: e.code, step: "mkdir-volume-trash" });
      return copyThenDelete(src, homeTrash, isDir, o);
    }
  }
  return renameInto(src, trashDir, isDir, method, o);
}

function renameInto(src, trashDir, isDir, method, o) {
  const base = path.basename(src);
  let name = base;
  let collisions = 0;
  for (let attempt = 0; attempt < 50; attempt++) {
    const target = path.join(trashDir, name);
    try {
      claim(target, isDir);
    } catch (e) {
      if (e.code === "EEXIST") {
        collisions++;
        const stamped = finderSuffixName(base, (o.now ?? (() => new Date()))());
        name = attempt === 0 ? stamped : `${stamped} ${attempt + 1}`;
        continue;
      }
      throw Object.assign(e, { step: "claim" });
    }
    try {
      fs.renameSync(src, target);
    } catch (e) {
      // 占位后改名失败：撤销占位（它是我们刚建的空目录/空文件）
      try {
        if (isDir) fs.rmdirSync(target);
        else fs.unlinkSync(target);
      } catch {}
      if (e.code === "EXDEV" && o.allowCopyFallback) return copyThenDelete(src, trashDir, isDir, o);
      throw Object.assign(e, { step: "rename" });
    }
    return { dest: target, method, collisions };
  }
  throw new Error("重名次数过多");
}

/** 跨卷兜底：复制到废纸篓里的临时名 → 改成正式名 → 确认完整后再删原件；任何一步失败原件都原样保留 */
export function copyThenDelete(src, homeTrash, isDir, o = {}) {
  const base = path.basename(src);
  let name = base;
  let claimed = null;
  for (let i = 0; i < 50 && !claimed; i++) {
    const t = path.join(homeTrash, name);
    try {
      claim(t, isDir);
      claimed = t;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const s = finderSuffixName(base);
      name = i === 0 ? s : `${s} ${i + 1}`;
    }
  }
  const partial = `${claimed}.runyard-partial`;
  try {
    if (isDir) fs.cpSync(src, partial, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true });
    else fs.copyFileSync(src, partial);
    fs.renameSync(partial, claimed); // 覆盖我们自己占位的空目录
  } catch (e) {
    // 失败：清掉半成品和占位，原件没动过
    try {
      fs.rmSync(partial, { recursive: true, force: true });
    } catch {}
    try {
      isDir ? fs.rmdirSync(claimed) : fs.unlinkSync(claimed);
    } catch {}
    throw Object.assign(e, { step: "copy", srcIntact: true });
  }
  removeInRoot(src); // 内部先放开只读权限再删；src 已通过 assertInRoot
  return { dest: claimed, method: "copy-delete", collisions: name === base ? 0 : 1 };
}

/** 还原：rename 回原位（原位不存在才行；存在则报错，不覆盖） */
export function restoreByRename(dest, original) {
  assertInRoot(original);
  if (fs.existsSync(original)) throw Object.assign(new Error("原位已存在"), { code: "EEXIST" });
  fs.renameSync(dest, original);
}

/**
 * 卷上的 .Trashes 按系统惯例是 1333（所有人可写入但不能列出别人的，带粘滞位），
 * 里面每个用户一个 0700 的 <uid> 目录。mkdir 受 umask 影响，所以建完再 chmod。
 */
function ensureVolumeTrash(trashesDir, uidDir) {
  if (!fs.existsSync(trashesDir)) {
    try {
      fs.mkdirSync(trashesDir, { mode: 0o1333 });
      fs.chmodSync(trashesDir, 0o1333);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  fs.mkdirSync(uidDir, { recursive: true, mode: 0o700 });
}
