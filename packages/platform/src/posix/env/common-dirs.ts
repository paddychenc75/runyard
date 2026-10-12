import { readdir, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import type { Env } from "../../platform.ts";

// 常见安装目录。只作为“解析失败时先显示点什么”的临时答案（与完整解析的一致率只有 61% 到 68%，
// 决策记录 0009），也是 tools.candidates 里 origin 为 known-location 的来源。
// 不读 Desktop、Documents、Downloads。

const SYSTEM_PATH = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

const FIXED_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/go/bin",
];

const HOME_DIRS = [
  ".volta/bin",
  ".local/share/fnm/aliases/default/bin",
  "Library/Application Support/fnm/aliases/default/bin",
  ".asdf/shims",
  ".local/share/mise/shims",
  ".pyenv/shims",
  ".local/bin",
  ".cargo/bin",
  ".bun/bin",
  "go/bin",
];

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function compareVersionsDescending(a: string, b: string): number {
  const parts = (name: string) => name.replace(/^v/, "").split(".").map(Number);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
  }
  return 0;
}

/** nvm 装的各个 Node：没有解析时不知道默认别名，取最高版本（所以会选错，这正是它只是临时答案的原因） */
async function nvmBinDirs(home: string): Promise<string[]> {
  const root = join(home, ".nvm", "versions", "node");
  try {
    const versions = (await readdir(root)).filter((name) => /^v\d/.test(name));
    return versions.sort(compareVersionsDescending).map((version) => join(root, version, "bin"));
  } catch {
    return [];
  }
}

/** 存在的常见安装目录，按优先顺序 */
export async function knownToolDirs(home: AbsPath): Promise<string[]> {
  const candidates = [
    ...FIXED_DIRS,
    ...HOME_DIRS.map((dir) => join(home, dir)),
    ...(await nvmBinDirs(home)),
  ];
  const present = await Promise.all(candidates.map((dir) => isDirectory(dir)));
  return candidates.filter((_, index) => present[index]);
}

/** PATH 里的目录（只要绝对路径；空项和相对项会让结果随工作目录变） */
export function pathDirs(env: Env): string[] {
  return (env.PATH ?? "").split(delimiter).filter((dir) => dir.startsWith("/"));
}

/** 回退用的环境：进程自己的环境，PATH 后面补上存在的常见目录（已有的不重复） */
export async function scanFallbackEnv(base: Env, home: AbsPath): Promise<Record<string, string>> {
  const current = pathDirs(base);
  const dirs = current.length > 0 ? current : SYSTEM_PATH;
  const extra = (await knownToolDirs(home)).filter((dir) => !dirs.includes(dir));
  return { ...base, PATH: [...dirs, ...extra].join(delimiter) };
}
