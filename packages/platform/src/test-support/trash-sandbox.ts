import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

// 废纸篓与改名测试的沙盒：一个自己的临时根目录，里面有假主目录（假 ~/.Trash 在它下面）。
// 绝对安全规则：每一次改名、移动、删除之前，都断言目标在这个根目录之内（guard）；
// 只有在 darwin 真系统工具的那个用例才会往真实 ~/.Trash 放东西，那里另有自己的守卫和逐项清理。

export interface Sandbox {
  readonly root: string;
  readonly home: string;
  /** 假主目录里的废纸篓 */
  readonly trash: string;
  /** 断言路径在沙盒之内，返回它 */
  guard(path: string): string;
  /** 在沙盒的 work 目录下的路径 */
  at(...parts: string[]): string;
  remove(): void;
}

export function makeSandbox(): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-trash-")));
  const home = join(root, "home");
  mkdirSync(home);
  mkdirSync(join(root, "work"));
  const guard = (path: string): string => {
    if (!path.startsWith(root + sep)) throw new Error(`path escapes the sandbox: ${path}`);
    return path;
  };
  return {
    root,
    home,
    trash: join(home, ".Trash"),
    guard,
    at: (...parts) => guard(join(root, "work", ...parts)),
    remove() {
      makeTreeWritable(root);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 测试里造过只读目录，清理前先放开，免得删不掉 */
export function makeTreeWritable(path: string): void {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(path);
  } catch {
    return;
  }
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeTreeWritable(join(path, name));
  } else {
    chmodSync(path, 0o600);
  }
}

/** 造一棵含各种条目的树：中文名、隐藏文件、空目录、只读文件、只读目录、悬空符号链接 */
export function buildRichTree(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.js"), "console.log(1)\n");
  writeFileSync(join(dir, ".hidden"), "h");
  writeFileSync(join(dir, "中文 名.txt"), "内容");
  mkdirSync(join(dir, "empty"));
  mkdirSync(join(dir, "sub", "deep"), { recursive: true });
  writeFileSync(join(dir, "sub", "deep", "f.bin"), Buffer.from([0, 1, 2, 255]));
  writeFileSync(join(dir, "ro.txt"), "readonly");
  chmodSync(join(dir, "ro.txt"), 0o444);
  symlinkSync("index.js", join(dir, "link-ok"));
  symlinkSync("does-not-exist", join(dir, "link-dangling"));
  mkdirSync(join(dir, "rodir"));
  writeFileSync(join(dir, "rodir", "inside.txt"), "x");
  chmodSync(join(dir, "rodir"), 0o555);
}

/** 造 fileCount 个小文件，分散在约 fileCount/30 个目录里 */
export function buildBigTree(dir: string, fileCount: number): void {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < fileCount; i++) {
    const sub = join(dir, `d${Math.floor(i / 30)}`);
    if (i % 30 === 0) mkdirSync(sub);
    writeFileSync(join(sub, `f${i}.txt`), `file ${i}\n`);
  }
}
