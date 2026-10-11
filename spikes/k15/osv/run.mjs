// OSV-Scanner v2.6.0（和 nightly-security.yml 固定的官方 Action 同一个版本）：
// 能否读 pnpm 11 的锁文件（单段、两段）；配置文件键名 [[IgnoredVulns]] 还是 [[IgnoreVulns]]；有没有按严重度过滤的选项；退出码。
// 二进制从官方 GitHub Release 下到临时目录，按同一发布里的 osv-scanner_SHA256SUMS 校验后才运行，结束时删除。
// 带高危公告的锁文件只在临时目录里现生成（braces@3.0.3），不进仓库。
import { createHash } from "node:crypto";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, run, tempDir, write, saveResult, tail } from "../lib.mjs";

const TAG = "v2.6.0";
const plat = { darwin: "darwin", linux: "linux", win32: "windows" }[process.platform];
const arch = { arm64: "arm64", x64: "amd64" }[process.arch];
const asset = `osv-scanner_${plat}_${arch}${plat === "windows" ? ".exe" : ""}`;
const bin = tempDir("osv-bin");
const dl = run("gh", ["release", "download", TAG, "-R", "google/osv-scanner", "-p", asset, "-p", "osv-scanner_SHA256SUMS", "-D", bin]);
if (dl.code !== 0) { console.error(dl.out); process.exit(1); }
const sums = readFileSync(join(bin, "osv-scanner_SHA256SUMS"), "utf8");
const want = sums.split("\n").map((l) => l.trim().split(/\s+/)).find((p) => p[1] === asset)?.[0];
const got = createHash("sha256").update(readFileSync(join(bin, asset))).digest("hex");
if (want !== got) { console.error(`校验失败 want=${want} got=${got}`); process.exit(1); }
chmodSync(join(bin, asset), 0o755);
const osv = join(bin, asset);

const results = { tag: TAG, asset, sha256: got, sha256Matches: true, when: new Date().toISOString(), os: process.platform, arch: process.arch };
results.version = run(osv, ["--version"]).out.trim().split("\n")[0];

// 生成锁文件：单段（braces@3.0.3 直接依赖）、两段（先 pnpm add --config 生成“环境段”）
function lockProject(name, twoSection) {
  const dir = tempDir(name);
  write(dir, "pnpm-workspace.yaml", `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 0\n`);
  write(dir, "package.json", JSON.stringify({ name, private: true, version: "1.0.0", dependencies: { braces: "3.0.3" } }));
  if (twoSection) run("pnpm", ["add", "--config", "is-number@7.0.0"], { cwd: dir, env: { CI: "" } });
  run("pnpm", ["install", "--lockfile-only"], { cwd: dir, env: { CI: "" } });
  return dir;
}
const single = lockProject("osv-single", false);
const two = lockProject("osv-two", true);
const sections = (d) => (readFileSync(join(d, "pnpm-lock.yaml"), "utf8").match(/^---$/gm) ?? []).length;
results.lockfiles = { singleSectionSeparators: sections(single), twoSectionSeparators: sections(two) };

const scan = (label, args, cwd) => {
  const r = run(osv, args, { cwd });
  const ids = [...new Set(r.out.match(/GHSA-[a-z0-9-]+|CVE-\d+-\d+/g) ?? [])];
  return { label, code: r.code, foundIds: ids, summary: tail(r.out.replace(/\s+\n/g, "\n"), 6).slice(0, 500) };
};
const out = {};
out["单段锁文件（有 braces@3.0.3）"] = scan("single", ["scan", "source", "--recursive", "--lockfile", join(single, "pnpm-lock.yaml")], single);
out["两段锁文件（环境段 + braces@3.0.3 在第二段）"] = scan("two", ["scan", "source", "--recursive", "--lockfile", join(two, "pnpm-lock.yaml")], two);
out["递归扫描目录（两段锁文件）"] = scan("dir", ["scan", "source", "--recursive", two], two);
out["仓库根锁文件（无已知公告）"] = scan("repo", ["scan", "source", "--lockfile", join(HERE, "..", "..", "pnpm-lock.yaml")], HERE);

// 配置文件键名：三种写法，看哪一种能让 GHSA-vfj7-8cjw-p6xm 被忽略
const id = "GHSA-vfj7-8cjw-p6xm";
for (const [label, toml] of [
  ["[[IgnoredVulns]]（官方示例）", `[[IgnoredVulns]]\nid = "${id}"\nreason = "k15 测试"\n`],
  ["[[IgnoreVulns]]（技术设计文字里的写法）", `[[IgnoreVulns]]\nid = "${id}"\nreason = "k15 测试"\n`],
  ["[[IgnoredVulns]] + ignoreUntil", `[[IgnoredVulns]]\nid = "${id}"\nignoreUntil = 2026-11-11\nreason = "k15 测试"\n`],
]) {
  const d = lockProject("osv-cfg", false);
  write(d, "osv-scanner.toml", toml);
  out[`配置键名 ${label}`] = scan(label, ["scan", "source", "--config", join(d, "osv-scanner.toml"), "--lockfile", join(d, "pnpm-lock.yaml")], d);
}
results.scans = out;

// 严重度过滤选项：看 --help 里有没有
const help = run(osv, ["scan", "source", "--help"]).out;
results.helpMentionsSeverity = help.split("\n").filter((l) => /severity|cvss|fail-on|min/i.test(l)).map((l) => l.trim());
results.helpFlags = help.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("--")).map((l) => l.split(/\s+/)[0]);
saveResult(`osv-${process.platform}-${process.arch}`, results);
console.log(JSON.stringify(results, null, 2));
