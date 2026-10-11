// Biome 2.5.14：noJsxLiterals（§6.8 第 1 层）、GritQL 自定义规则（第 2 层）、按目录配置 noRestrictedImports / noNodejsModules。
// 做法：在临时目录装固定版本的 Biome，复制 fixture，跑 lint，把每条诊断对到源码行，和行尾 "// BAD <规则>" 标记比对。
// 用法：node biome/run.mjs
import { cpSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { HERE, run, tempDir, write, read, saveResult, tail } from "../lib.mjs";

const BIOME = "2.5.14"; // 与根 pnpm-workspace.yaml 的 catalog 一致
const tool = tempDir("biome-bin");
write(tool, "package.json", JSON.stringify({ name: "b", private: true, version: "1.0.0" }));
write(tool, "pnpm-workspace.yaml", `storeDir: ${tool}/.store\ncacheDir: ${tool}/.cache\nminimumReleaseAge: 20160\nsavePrefix: ""\n`);
const inst = run("pnpm", ["add", "-D", `@biomejs/biome@${BIOME}`, "--save-exact"], { cwd: tool, env: { CI: "" } });
if (inst.code !== 0) { console.error(inst.out); process.exit(1); }
// 直接用 Node 运行 Biome 的 JS 入口：Windows 上 .bin/biome 是 .cmd，不能不经 shell 执行
const biomeJs = join(tool, "node_modules/@biomejs/biome/bin/biome");
const biomeRun = (args, opts) => run(process.execPath, [biomeJs, ...args], opts);
const version = biomeRun(["--version"]).out.trim();

const categoryOf = (c) => ({ "lint/style/noJsxLiterals": "jsx", plugin: "attr", "lint/style/noRestrictedImports": "imports", "lint/correctness/noNodejsModules": "node" })[c] ?? c;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

function evaluate(label, mutate = (dir) => {}) {
  const dir = tempDir("biome-fx");
  cpSync(join(HERE, "biome/fixture"), dir, { recursive: true });
  mutate(dir);
  const r = biomeRun(["lint", "--reporter=json", "--max-diagnostics=none", "."], { cwd: dir });
  let diags = [];
  try { diags = JSON.parse(r.out.slice(r.out.indexOf("{"), r.out.lastIndexOf("}") + 1)).diagnostics ?? []; } catch { return { label, error: tail(r.out, 12).slice(0, 800) }; }
  const actual = new Set();
  for (const d of diags) {
    const file = d.location?.path?.file ?? d.location?.path;
    if (!file || !["lint/style/noJsxLiterals", "plugin", "lint/style/noRestrictedImports", "lint/correctness/noNodejsModules"].includes(d.category)) {
      if (d.category === "parse" || d.category === "deserialize") return { label, error: `配置或源码解析失败: ${d.message}` };
      continue; // 其他规则（本 spike 不关心）
    }
    actual.add(`${file}:${d.location.start.line}:${categoryOf(d.category)}`);
  }
  // 期望
  const rows = [];
  const unexpected = [];
  const expectedKeys = new Set();
  for (const f of walk(dir).filter((p) => /\.(tsx?|json)$/.test(p) && !p.includes("node_modules"))) {
    if (f.endsWith("biome.jsonc")) continue;
    const rel = relative(dir, f);
    readFileSync(f, "utf8").split("\n").forEach((text, i) => {
      const m = /\/\/ (BAD|BAD-GAP) (\w+)/.exec(text);
      if (!m) return;
      const key = `${rel}:${i + 1}:${m[2]}`;
      expectedKeys.add(key);
      const hit = actual.has(key);
      rows.push({ where: `${rel}:${i + 1}`, rule: m[2], marker: m[1], flagged: hit, verdict: m[1] === "BAD" ? (hit ? "拦住了" : "漏了") : hit ? "意外拦住" : "漏（已知缺口）" });
    });
  }
  for (const k of actual) if (!expectedKeys.has(k)) unexpected.push(k); // 不该有诊断的行却有了：误伤
  return { label, version, total: diags.length, rows, falsePositives: unexpected.sort() };
}

const results = { node: process.version, biome: version, when: new Date().toISOString() };
results.configAsDesigned_noStringsFalse = evaluate("noStrings:false（本 spike 建议）");
results.configAsDesigned_noStringsTrue = evaluate("noStrings:true（技术设计 §6.8 原文）", (dir) => {
  const p = join(dir, "biome.jsonc");
  write(dir, "biome.jsonc", readFileSync(p, "utf8").replace('"noStrings": false', '"noStrings": true'));
});
saveResult(`biome-${process.platform}`, results);
for (const k of ["configAsDesigned_noStringsFalse", "configAsDesigned_noStringsTrue"]) {
  const x = results[k];
  console.log(`\n== ${x.label}  (diagnostics ${x.total})`);
  for (const r of x.rows ?? []) console.log(`${r.verdict.padEnd(8)} ${r.where} [${r.rule}]`);
  console.log("误伤（没标记 BAD 却被拦）:", x.falsePositives ?? x.error);
}
