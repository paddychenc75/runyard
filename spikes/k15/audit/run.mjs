// pnpm audit 的退出码数值、--ignore-registry-errors、pnpm audit signatures（技术设计 §8.6.3 表里的未核实项）。
// 带高危公告的包只装在临时目录里（不进仓库的任何锁文件）。
import { HERE, run, tempDir, write, read, saveResult, grep, tail } from "../lib.mjs";

const results = { pnpm: run("pnpm", ["-v"]).out.trim(), when: new Date().toISOString() };
function project(name, deps, ws = "") {
  const dir = tempDir(name);
  write(dir, "package.json", JSON.stringify({ name, private: true, version: "1.0.0", dependencies: deps }));
  write(dir, "pnpm-workspace.yaml", `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\nminimumReleaseAge: 0\n${ws}`);
  return dir;
}
const pnpm = (dir, args, env = {}) => run("pnpm", args, { cwd: dir, env: { CI: "", ...env } });
const brief = (r) => ({ code: r.code, head: r.out.trim().split("\n").slice(0, 3).join(" | ").slice(0, 300) });

// 带 braces@3.0.3（GHSA-vfj7-8cjw-p6xm，高危）的锁文件
const bad = project("audit-bad", { braces: "3.0.3" });
pnpm(bad, ["install", "--lockfile-only", "--no-frozen-lockfile"]);
const ok = project("audit-ok", { zod: "4.6.5" });
pnpm(ok, ["install", "--lockfile-only", "--no-frozen-lockfile"]);

const out = {};
out["有高危：--audit-level high"] = brief(pnpm(bad, ["audit", "--prod", "--audit-level", "high"]));
out["有高危：--audit-level critical"] = brief(pnpm(bad, ["audit", "--prod", "--audit-level", "critical"]));
out["有高危：--json"] = (() => { const r = pnpm(bad, ["audit", "--prod", "--json"]); let advisories = null; try { advisories = Object.keys(JSON.parse(r.out).advisories ?? {}).length; } catch {} return { code: r.code, advisoriesParsed: advisories, topKeys: (() => { try { return Object.keys(JSON.parse(r.out)); } catch { return "不是 JSON"; } })() }; })();
out["无公告：--audit-level high"] = brief(pnpm(ok, ["audit", "--prod", "--audit-level", "high"]));
// 注册表不可用（连到一个不监听的本机端口）
const reg = ["--registry", "http://127.0.0.1:9/"];
out["注册表不可用：不加 --ignore-registry-errors"] = brief(pnpm(ok, ["audit", "--prod", "--audit-level", "high", ...reg]));
out["注册表不可用：加 --ignore-registry-errors"] = brief(pnpm(ok, ["audit", "--prod", "--audit-level", "high", "--ignore-registry-errors", ...reg]));
// 注册表可用但有高危，加 --ignore-registry-errors 时仍应失败
out["有高危 + --ignore-registry-errors"] = brief(pnpm(bad, ["audit", "--prod", "--audit-level", "high", "--ignore-registry-errors"]));
// audit signatures：需要已安装
const inst = pnpm(ok, ["install", "--ignore-scripts"]);
out["audit signatures（已安装 zod）"] = brief(pnpm(ok, ["audit", "signatures"]));
out["audit signatures 前置安装"] = { code: inst.code };
results.audit = out;
saveResult(`audit-${process.platform}`, results);
console.log(JSON.stringify(results, null, 2));
