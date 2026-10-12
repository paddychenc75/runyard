import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";

// 核对复制是否完整：两棵树的条目名、种类、权限、文件大小和内容摘要、符号链接目标逐一相同。
// 原件只有在这里通过之后才可能被删，所以宁可严：任何一点对不上就抛出，原件保留。

interface Fingerprint {
  readonly kind: "dir" | "file" | "link";
  readonly mode: number | null;
  readonly detail: string;
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function fingerprint(path: string): Promise<Fingerprint> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return { kind: "link", mode: null, detail: await readlink(path) };
  if (info.isDirectory()) return { kind: "dir", mode: info.mode & 0o7777, detail: "" };
  if (info.isFile()) {
    return { kind: "file", mode: info.mode & 0o7777, detail: `${info.size}:${await digest(path)}` };
  }
  // 套接字、设备等：项目文件夹里不该有，复制不了就当不完整
  throw new Error(`unsupported entry type: ${path}`);
}

async function snapshot(root: string): Promise<Map<string, Fingerprint>> {
  const result = new Map<string, Fingerprint>();
  const walk = async (rel: string): Promise<void> => {
    const full = rel === "" ? root : join(root, rel);
    const print = await fingerprint(full);
    result.set(rel, print);
    if (print.kind !== "dir") return;
    for (const name of await readdir(full)) await walk(rel === "" ? name : join(rel, name));
  };
  await walk("");
  return result;
}

/** 两棵树一致返回 undefined，否则返回第一处不一致的说明（只进日志） */
export async function compareTrees(source: string, copy: string): Promise<string | undefined> {
  const [from, to] = await Promise.all([snapshot(source), snapshot(copy)]);
  if (from.size !== to.size) return `entry count differs: ${from.size} vs ${to.size}`;
  for (const [rel, expected] of from) {
    const actual = to.get(rel);
    if (actual === undefined) return `missing in copy: ${rel}`;
    if (
      actual.kind !== expected.kind ||
      actual.mode !== expected.mode ||
      actual.detail !== expected.detail
    ) {
      return `differs: ${rel}`;
    }
  }
  return undefined;
}
