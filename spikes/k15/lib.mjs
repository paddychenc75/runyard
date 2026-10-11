// 各实验共用的小工具：跑命令、建/清临时目录、写结果。
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
const made = [];

// 所有临时目录都登记在这里，结束（包括失败）时统一删除；只删自己建的
export function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `k15-${prefix}-`));
  made.push(dir);
  return dir;
}
export function cleanup() {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

// 去掉颜色和进度刷新，保留可读文本
const strip = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

export function run(cmd, args, { cwd, env = {}, input, timeout = 240000 } = {}) {
  // Windows 上 pnpm 是 pnpm.cmd 垫片，Node 不许不经 shell 直接执行 .cmd（会 ENOENT/EINVAL），所以只对 pnpm 开 shell
  const r = spawnSync(cmd, args, {
    shell: process.platform === "win32" && cmd === "pnpm",
    cwd,
    env: { ...process.env, NO_COLOR: "1", ...env },
    input,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = strip(`${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n[spawn error] ${r.error.message}` : ""}`);
  return { code: r.status, signal: r.signal, out };
}

export function write(dir, file, text) {
  const p = join(dir, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
export const read = (dir, file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null);

export function saveResult(name, data) {
  mkdirSync(join(HERE, "results"), { recursive: true });
  writeFileSync(join(HERE, "results", `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}
export const tail = (s, n = 8) => s.trim().split("\n").slice(-n).join("\n");
export const grep = (s, re) => s.split("\n").filter((l) => re.test(l)).join("\n");
