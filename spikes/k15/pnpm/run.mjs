// pnpm 11 行为核对：allowBuilds、minimumReleaseAge（含对已有锁文件的重新校验）、
// minimumReleaseAgeExcludePrune、trustPolicy: no-downgrade、corepack。
// 全部在临时目录里做，不改仓库的任何配置；store 与 cache 也放进临时目录。
// 用法：node pnpm/run.mjs [--only allow,age,prune,trust,corepack]
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { HERE, run, tempDir, write, read, saveResult, tail, grep } from "../lib.mjs";

const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "allow,age,prune,trust,corepack").split(",");
const REPO = join(HERE, "..", "..");
const results = { node: process.version, pnpm: run("pnpm", ["-v"]).out.trim(), when: new Date().toISOString() };

// 每个临时项目的 pnpm-workspace.yaml 都带上 store/cache 的位置，避免写进用户主目录
function project(name, { pkg, ws = "" }) {
  const dir = tempDir(name);
  write(dir, "package.json", JSON.stringify({ name, private: true, version: "1.0.0", ...pkg }, null, 2));
  write(dir, "pnpm-workspace.yaml", `storeDir: ${dir}/.store\ncacheDir: ${dir}/.cache\n${ws}`);
  return dir;
}
const pnpm = (dir, args) => run("pnpm", args, { cwd: dir, env: { CI: "", npm_config_loglevel: "info" } });
const summary = (r) => ({ code: r.code, errors: grep(r.out, /ERR_PNPM|ERROR|WARN|Ignored|postinstall/i).split("\n").slice(0, 6) });

if (only.includes("allow")) {
  // 1. allowBuilds 写法：esbuild 0.25.12 有 postinstall（装完校验二进制）
  const out = {};
  const cases = {
    "不写任何设置": "",
    "allowBuilds: {esbuild: true}": "allowBuilds:\n  esbuild: true\n",
    "allowBuilds: {esbuild: false}": "allowBuilds:\n  esbuild: false\n",
    "旧写法 onlyBuiltDependencies": "onlyBuiltDependencies:\n  - esbuild\n",
    "strictDepBuilds: false（不写 allowBuilds）": "strictDepBuilds: false\n",
  };
  for (const [name, ws] of Object.entries(cases)) {
    const dir = project("allow", { pkg: { dependencies: { esbuild: "0.25.12" } }, ws });
    const r = pnpm(dir, ["install", "--no-frozen-lockfile"]);
    out[name] = { ...summary(r), postinstallRan: /esbuild postinstall/.test(r.out) };
  }
  results.allowBuilds = out;
}

if (only.includes("age")) {
  // 2. minimumReleaseAge：zod@4.6.6 发布不满 14 天；先用 age=0 生成锁文件，再收紧
  const out = {};
  const base = project("age", { pkg: {}, ws: "minimumReleaseAge: 0\n" });
  out.createLockWithAge0 = summary(pnpm(base, ["add", "zod@4.6.6", "--save-exact"]));
  const lock = read(base, "pnpm-lock.yaml");
  out.lockHasZod466 = /zod@4\.6\.6|zod:\s*\n\s*specifier: 4\.6\.6/.test(lock ?? "");
  const strict = (extra = "") => `minimumReleaseAge: 20160\n${extra}`;
  const reset = (extra) => {
    const d = project("age2", { pkg: { dependencies: { zod: "4.6.6" } }, ws: strict(extra) });
    write(d, "pnpm-lock.yaml", lock);
    return d;
  };
  out.frozenInstallWithFreshLockedVersion = summary(pnpm(reset(), ["install", "--frozen-lockfile"]));
  out.plainInstallWithFreshLockedVersion = summary(pnpm(reset(), ["install"]));
  out.lockfileOnlyReresolve = summary(pnpm(reset(), ["install", "--lockfile-only", "--no-frozen-lockfile", "--force"]));
  // 全新解析（没有锁文件）
  const fresh = project("age3", { pkg: { dependencies: { zod: "4.6.6" } }, ws: strict() });
  out.freshResolveFreshVersion = summary(pnpm(fresh, ["install"]));
  const fresh2 = project("age4", { pkg: {}, ws: strict() });
  out.addOldVersion_zod465 = summary(pnpm(fresh2, ["add", "zod@4.6.5", "--save-exact"]));
  const fresh3 = project("age5", { pkg: {}, ws: strict() });
  out.addRangeLatest_zod = summary(pnpm(fresh3, ["add", "zod"]));
  out.addRangeLatest_zodVersion = JSON.parse(read(fresh3, "package.json")).dependencies?.zod;
  // 例外条目：按“包名@版本”写
  const ex = project("age6", { pkg: {}, ws: strict("minimumReleaseAgeExclude:\n  - zod@4.6.6\n") });
  out.excludeVersionEntry_addFresh = summary(pnpm(ex, ["add", "zod@4.6.6", "--save-exact"]));
  const ex2 = project("age7", { pkg: {}, ws: strict("minimumReleaseAgeExclude:\n  - zod\n") });
  out.excludeBareNameEntry_addFresh = summary(pnpm(ex2, ["add", "zod@4.6.6", "--save-exact"]));
  results.minimumReleaseAge = out;
}

if (only.includes("prune")) {
  // 3. minimumReleaseAgeExcludePrune：例外条目对应的版本已满 14 天时，是否在 install/add 后被清掉
  const out = {};
  const entries = ["zod@4.6.5", "zod@4.6.6", "ms", "left-pad@1.3.0", "no-such-package-xyz@1.0.0"];
  const wsFor = (prune) =>
    `minimumReleaseAge: 20160\nminimumReleaseAgeExcludePrune: ${prune}\nminimumReleaseAgeExclude:\n${entries.map((e) => `  - ${e}`).join("\n")}\n`;
  for (const [cmdName, args] of [["install", ["install"]], ["add", ["add", "is-number@7.0.0", "--save-exact"]]]) {
    for (const prune of [true, false]) {
      const d = project("prune", { pkg: { dependencies: { zod: "4.6.5" } }, ws: wsFor(prune) });
      const r = pnpm(d, args);
      const after = read(d, "pnpm-workspace.yaml");
      const kept = after.split("\n").filter((l) => /^\s+- /.test(l)).map((l) => l.trim().slice(2));
      out[`${cmdName} / prune=${prune}`] = { code: r.code, entriesBefore: entries, entriesAfter: kept, errors: summary(r).errors };
    }
  }
  // 3b 判断依据到底是“年龄”还是“锁文件还用不用这个版本”：
  //    先用 age=0 把 zod@4.6.6（发布不满 14 天）装进锁文件，条目在用；再看 install 与升级后的结果
  const base = project("prune-used", { pkg: {}, ws: "minimumReleaseAge: 20160\nminimumReleaseAgeExcludePrune: true\nminimumReleaseAgeExclude:\n  - zod@4.6.6\n" });
  out["在用且不满14天：add zod@4.6.6"] = summary(pnpm(base, ["add", "zod@4.6.6", "--save-exact"]));
  out["在用且不满14天：之后 install，条目还在吗"] = { code: pnpm(base, ["install"]).code, entries: read(base, "pnpm-workspace.yaml").split("\n").filter((l) => /^\s+- /.test(l)).map((l) => l.trim().slice(2)) };
  out["升级到 zod@4.6.5 之后（锁文件不再用 4.6.6）"] = { code: pnpm(base, ["add", "zod@4.6.5", "--save-exact"]).code, entries: read(base, "pnpm-workspace.yaml").split("\n").filter((l) => /^\s+- /.test(l)).map((l) => l.trim().slice(2)) };
  results.excludePrune = out;
}

if (only.includes("trust")) {
  // 4. trustPolicy: no-downgrade
  const out = {};
  // 4a 仓库当前的依赖树：复制所有 package.json、pnpm-workspace.yaml、锁文件到临时目录
  const copy = tempDir("trust-repo");
  const files = execFileSync("git", ["ls-files", "--", "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "**/package.json"], { cwd: REPO, encoding: "utf8" })
    .split("\n").filter(Boolean).filter((f) => !f.startsWith("spikes/"));
  for (const f of files) { mkdirSync(dirname(join(copy, f)), { recursive: true }); cpSync(join(REPO, f), join(copy, f)); }
  const wsPath = join(copy, "pnpm-workspace.yaml");
  write(copy, "pnpm-workspace.yaml", `${readFileSync(wsPath, "utf8")}\nstoreDir: ${copy}/.store\ncacheDir: ${copy}/.cache\ntrustPolicy: no-downgrade\n`);
  out.repoCopyFiles = files;
  out.repoFrozenInstall = summary(pnpm(copy, ["install", "--frozen-lockfile", "--ignore-scripts"]));
  // 删掉锁文件强制整棵树重新解析，才真正触发信任检查
  run("rm", ["-f", join(copy, "pnpm-lock.yaml")]);
  out.repoFreshResolve = summary(pnpm(copy, ["install", "--no-frozen-lockfile", "--ignore-scripts", "--lockfile-only"]));
  // 4b 技术设计 §8.1 里 Electron + Vite + React 一整套（版本取该表）
  const deps = {
    electron: "44.4.5", "electron-builder": "26.17.0", "electron-vite": "5.0.0", vite: "7.3.6",
    "@vitejs/plugin-react": "5.0.1", react: "19.3.0", "react-dom": "19.3.0", typescript: "6.0.3", vitest: "4.1.11",
    playwright: "1.63.0", "node-pty": "1.1.0", chokidar: "5.0.0", "monaco-editor": "0.57.0", "@shikijs/monaco": "4.4.3",
    "@xterm/xterm": "6.0.0", zod: "4.6.5", tsdown: "0.23.0", "release-please": "17.11.2", astro: "7.3.5", "@astrojs/starlight": "0.42.4",
  };
  for (const [label, ws] of [
    ["trust only (age 0)", "minimumReleaseAge: 0\ntrustPolicy: no-downgrade\n"],
    ["trust + age 14d", "minimumReleaseAge: 20160\ntrustPolicy: no-downgrade\n"],
    ["age 14d only (对照)", "minimumReleaseAge: 20160\n"],
  ]) {
    const d = project("trust-tree", { pkg: { dependencies: deps }, ws });
    const t0 = Date.now();
    const r = pnpm(d, ["install", "--ignore-scripts", "--no-frozen-lockfile", "--lockfile-only"]);
    out[`tree: ${label}`] = { ...summary(r), seconds: Math.round((Date.now() - t0) / 1000), tail: tail(r.out, 6) };
  }
  // 4c 怎样放行：trustPolicyIgnoreAfter（只检查最近发布的版本）；trustPolicyExclude 逐个加要加几条
  for (const mins of [20160, 129600, 525600]) {
    const d = project("trust-ignore", { pkg: { dependencies: deps }, ws: `minimumReleaseAge: 20160\ntrustPolicy: no-downgrade\ntrustPolicyIgnoreAfter: ${mins}\n` });
    const r = pnpm(d, ["install", "--ignore-scripts", "--no-frozen-lockfile", "--lockfile-only"]);
    out[`tree: trustPolicyIgnoreAfter=${mins} 分钟`] = { code: r.code, errors: summary(r).errors.filter((l) => /TRUST|This error/.test(l)) };
  }
  {
    const excluded = [];
    let last;
    for (let i = 0; i < 25; i++) {
      const d = project("trust-excl", { pkg: { dependencies: deps }, ws: `minimumReleaseAge: 20160\ntrustPolicy: no-downgrade\ntrustPolicyExclude:\n${excluded.map((e) => `  - "${e}"`).join("\n") || "  []"}\n`.replace("trustPolicyExclude:\n  []", "trustPolicyExclude: []") });
      last = pnpm(d, ["install", "--ignore-scripts", "--no-frozen-lockfile", "--lockfile-only"]);
      const m = /trust downgrade for "([^"]+)"/.exec(last.out);
      if (last.code === 0 || !m) break;
      excluded.push(m[1]);
    }
    out["tree: 逐个 trustPolicyExclude"] = { finalCode: last.code, excludedNeeded: excluded, lastError: last.code === 0 ? null : tail(last.out, 3) };
  }
  results.trustPolicy = out;
}

if (only.includes("corepack")) {
  const node = process.execPath;
  const r = run("corepack", ["--version"]);
  results.corepack = {
    node: process.version,
    corepackVersion: r.out.trim().split("\n").pop(),
    path: run("sh", ["-c", "command -v corepack"]).out.trim(),
    nextToNode: existsSync(join(dirname(node), "corepack")),
  };
}

saveResult(`pnpm-${process.platform}`, results);
console.log(JSON.stringify(results, null, 2));
