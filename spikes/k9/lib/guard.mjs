// 安全护栏：本 spike 所有会移动、删除文件的调用都必须先过这里。
// 规则：目标路径必须在“本次运行自己创建的临时根目录”之内，
// 或者是“已登记的、带唯一前缀和标记文件的废纸篓条目”。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const PREFIX = "runyard-spike-k9-";
export const MARKER = ".runyard-spike-k9-marker";

const state = { root: null, token: null, trashed: new Set() };

export function makeRoot() {
  // realpath：macOS 的 /var 是 /private/var 的链接，不解析会让“以根开头”的断言失灵
  state.root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), PREFIX)));
  state.token = crypto.randomBytes(8).toString("hex");
  return state.root;
}
export const root = () => state.root;
export const token = () => state.token;

export function inRoot(p) {
  const abs = path.resolve(p);
  return abs.startsWith(state.root + path.sep);
}

/** 断言：p 在临时根之内（不跟随最后一级符号链接，所以用 resolve 而不是 realpath） */
export function assertInRoot(p) {
  if (!state.root) throw new Error("guard: 还没有 makeRoot()");
  if (!inRoot(p)) throw new Error(`guard: 路径不在临时根内: ${p}`);
}

/** 登记一个放进了真实废纸篓的条目（全路径）。后面只允许删除登记过的条目。 */
export function registerTrashed(p) {
  state.trashed.add(path.resolve(p));
}
export function unregisterTrashed(p) {
  state.trashed.delete(path.resolve(p));
}
export const registeredTrashed = () => [...state.trashed];

function chmodWalk(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) {
    fs.chmodSync(p, st.mode | 0o700);
    for (const n of fs.readdirSync(p)) chmodWalk(path.join(p, n));
  } else {
    fs.chmodSync(p, st.mode | 0o600);
  }
}

/** 删除临时根内的东西（不跟随符号链接）。 */
export function removeInRoot(p) {
  assertInRoot(p);
  if (!fs.existsSync(p) && !isLink(p)) return;
  try {
    chmodWalk(p);
  } catch {}
  fs.rmSync(p, { recursive: true, force: true });
}
const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * 删除一个我们自己放进真实废纸篓的条目。三重核对：
 * 1) 已登记 2) 名字以唯一前缀开头（名字可能被加了时间后缀，所以是 startsWith）
 * 3) 里面的标记文件内容等于本次运行的 token
 */
export function removeOwnTrashItem(p) {
  const abs = path.resolve(p);
  if (!state.trashed.has(abs)) throw new Error(`guard: 未登记的废纸篓条目: ${abs}`);
  if (!path.basename(abs).startsWith(PREFIX)) throw new Error(`guard: 前缀不符: ${abs}`);
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) {
    // 文件夹符号链接本身：只删链接，不碰目标
    fs.unlinkSync(abs);
  } else {
    const mk = path.join(abs, MARKER);
    if (fs.readFileSync(mk, "utf8").trim() !== state.token) throw new Error(`guard: 标记不符: ${abs}`);
    chmodWalk(abs);
    fs.rmSync(abs, { recursive: true, force: true });
  }
  state.trashed.delete(abs);
}

export function newName(tag = "") {
  return `${PREFIX}${crypto.randomBytes(4).toString("hex")}${tag ? "-" + tag : ""}`;
}

/** 删除临时根本身（结束时用）。要求：在系统临时目录下、名字有唯一前缀 */
export function removeRoot() {
  const real = fs.realpathSync.native(os.tmpdir());
  if (!state.root.startsWith(real + path.sep) || !path.basename(state.root).startsWith(PREFIX)) throw new Error("guard: 根不合法");
  try { chmodWalk(state.root); } catch {}
  fs.rmSync(state.root, { recursive: true, force: true, maxRetries: 3 });
}
