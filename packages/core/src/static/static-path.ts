import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

// 把请求路径映射到项目文件夹里的一个文件（规格 TEMPLATES-RUNNERS-10）。
// 不让请求跳出文件夹：路径里有 `..`、编码后的 `..`、反斜杠、空字符一律拒绝；符号链接先解析再比对根，
// 指到文件夹外面的拒绝。`.runyard/` 是应用自己的数据，不对外提供，也不列目录。
// 这里直接用 node:fs：平台层没有 realpath，而比较的是真实路径，假文件系统帮不上忙。

export type StaticResolution =
  | { readonly status: "file"; readonly file: string }
  | { readonly status: 400 | 403 | 404 };

const HIDDEN_DIR = ".runyard";

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel.split(/[\\/]/)[0] !== ".." && !isAbsolute(rel));
}

/** 请求目标（含查询串）拆成已解码的路径片段；有越界迹象时返回错误状态 */
export function splitRequestPath(target: string): readonly string[] | 400 | 403 {
  const raw = target.split(/[?#]/, 1)[0] ?? "";
  const segments: string[] = [];
  for (const part of raw.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return 400;
    }
    if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) return 403;
    if (decoded === "..") return 403;
    if (decoded === "" || decoded === ".") continue;
    segments.push(decoded);
  }
  return segments;
}

async function realOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

/** `root` 必须已经是真实路径（realpath 之后的） */
export async function resolveStaticFile(root: string, target: string): Promise<StaticResolution> {
  const segments = splitRequestPath(target);
  if (typeof segments === "number") return { status: segments };
  if (segments.some((segment) => segment.toLowerCase() === HIDDEN_DIR)) return { status: 404 };

  let real = await realOrUndefined(join(root, ...segments));
  if (real === undefined) return { status: 404 };
  if (!isInside(root, real)) return { status: 403 };
  let info = await stat(real);
  if (info.isDirectory()) {
    // 不列目录：只认目录下的 index.html
    real = await realOrUndefined(join(real, "index.html"));
    if (real === undefined) return { status: 404 };
    if (!isInside(root, real)) return { status: 403 };
    info = await stat(real);
  }
  if (!info.isFile()) return { status: 404 };
  // 符号链接可以绕进 .runyard/，解析之后再查一次
  if (isInside(join(root, HIDDEN_DIR), real)) return { status: 404 };
  return { status: "file", file: real };
}
