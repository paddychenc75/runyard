// 生成一棵像 node_modules 的假目录树：很多小文件、深层嵌套、符号链接（含悬空）、
// 几个大文件、只读文件、带扩展属性的文件、隐藏文件、中文和 emoji 的名字。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { MARKER, assertInRoot, token } from "./guard.mjs";

/**
 * @param {string} dir 要创建的项目根目录（必须在临时根内）
 * @param {{files?:number, symlinks?:boolean, xattrs?:boolean, bigMB?:number}} o
 */
export function makeTree(dir, o = {}) {
  const files = o.files ?? 30000;
  const symlinks = o.symlinks ?? true;
  const xattrs = o.xattrs ?? true;
  const bigMB = o.bigMB ?? 8;
  const deep_ = o.deep ?? true; // 深层嵌套目录；Windows 回收站实验必须关掉（路径超过 260 会被外壳静默永久删除）
  assertInRoot(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), token() + "\n");
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(nm);
  let n = 0;
  const per = 40;
  const pkgs = Math.ceil(files / per);
  for (let p = 0; p < pkgs && n < files; p++) {
    // 每个包 3 层嵌套的子目录
    const base = path.join(nm, `pkg-${p}`, "lib", "dist");
    fs.mkdirSync(base, { recursive: true });
    for (let i = 0; i < per && n < files; i++, n++) {
      fs.writeFileSync(path.join(base, `f${i}.js`), `// ${p}/${i}\nmodule.exports=${n};\n`);
    }
  }
  // 深层嵌套：30 层（macOS 路径上限 1024 字节，再深会 ENAMETOOLONG）
  if (deep_) {
    let deep = path.join(dir, "deep");
    for (let i = 0; i < 30; i++) deep = path.join(deep, `lv-${i}-abcdefghij`);
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "bottom.txt"), "bottom\n");
  }
  // 中文、emoji、隐藏文件、空格
  fs.writeFileSync(path.join(dir, "说明 文档.md"), "你好\n");
  fs.writeFileSync(path.join(dir, "🚀rocket 火箭.txt"), "🚀\n");
  fs.writeFileSync(path.join(dir, ".hidden"), "h\n");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  // 大文件
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, `big${i}.bin`), crypto.randomBytes(bigMB * 1024 * 1024));
  // 只读文件和只读目录
  fs.writeFileSync(path.join(dir, "readonly.txt"), "ro\n");
  fs.chmodSync(path.join(dir, "readonly.txt"), 0o444);
  fs.mkdirSync(path.join(dir, "rodir"));
  fs.writeFileSync(path.join(dir, "rodir", "x.txt"), "x\n");
  fs.chmodSync(path.join(dir, "rodir"), 0o555);
  // 可执行脚本
  fs.writeFileSync(path.join(dir, "run.sh"), "#!/bin/sh\necho hi\n", { mode: 0o755 });
  if (symlinks) {
    fs.symlinkSync("node_modules/pkg-0/lib/dist/f0.js", path.join(dir, "link-ok"));
    fs.symlinkSync("does-not-exist", path.join(dir, "link-broken"));
    fs.symlinkSync("..", path.join(dir, "node_modules", "link-up"));
    fs.symlinkSync("/nonexistent/abs/target", path.join(dir, "link-abs-broken"));
  }
  if (xattrs) {
    const f = path.join(dir, "说明 文档.md");
    execFileSync("xattr", ["-w", "com.runyard.test", "value-中文", f]);
    execFileSync("xattr", ["-w", "com.apple.metadata:kMDItemWhereFroms", "x", path.join(dir, ".hidden")]);
  }
  return dir;
}

/** 取样校验：校验和 + 链接目标 + 模式 + 扩展属性 */
export function fingerprint(dir) {
  const out = {};
  const sample = [
    "说明 文档.md",
    "🚀rocket 火箭.txt",
    ".hidden",
    "readonly.txt",
    "run.sh",
    "big0.bin",
    "big2.bin",
    "node_modules/pkg-0/lib/dist/f0.js",
    "node_modules/pkg-100/lib/dist/f7.js",
    "rodir/x.txt",
    ".git/HEAD",
  ];
  for (const rel of sample) {
    const p = path.join(dir, rel);
    try {
      const st = fs.lstatSync(p);
      const sha = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);
      out[rel] = { mode: (st.mode & 0o7777).toString(8), sha };
    } catch (e) {
      out[rel] = { err: e.code };
    }
  }
  for (const l of ["link-ok", "link-broken", "link-abs-broken", "node_modules/link-up"]) {
    try {
      out[l] = { link: fs.readlinkSync(path.join(dir, l)) };
    } catch (e) {
      out[l] = { err: e.code };
    }
  }
  try {
    out.xattr = execFileSync("xattr", ["-l", path.join(dir, "说明 文档.md")], { encoding: "utf8" });
  } catch (e) {
    out.xattr = "ERR";
  }
  out.rodirMode = (fs.lstatSync(path.join(dir, "rodir")).mode & 0o7777).toString(8);
  return out;
}

export function countEntries(dir) {
  let files = 0;
  let dirs = 0;
  let links = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (e.isSymbolicLink()) links++;
      else if (e.isDirectory()) {
        dirs++;
        stack.push(path.join(d, e.name));
      } else files++;
    }
  }
  return { files, dirs, links };
}
