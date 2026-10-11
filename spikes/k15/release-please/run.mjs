// release-please 17.11.2：单版本号配置 + 中文主题提交的版本号与更新日志（技术设计 §8.4）。
// 做法：release-please 的命令行必须连 GitHub（--local 模式也要查 GitHub API），所以这里直接用它的库：
// 在临时目录建一个一次性 git 仓库，写一个只读本地 git 的 Scm 实现（接口见库里的 scm.d.ts），交给 Manifest，
// 调 buildPullRequests() ——这正是命令行 release-pr --dry-run 在拿到 GitHub 数据后做的那一步。没有任何网络写入，也不用令牌。
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { run, tempDir, write, saveResult, tail } from "../lib.mjs";

const VERSION = "17.11.2";
const tool = tempDir("rp-bin");
write(tool, "package.json", JSON.stringify({ name: "rp", private: true, version: "1.0.0" }));
write(tool, "pnpm-workspace.yaml", `storeDir: ${tool}/.store\ncacheDir: ${tool}/.cache\nminimumReleaseAge: 20160\nsavePrefix: ""\n`);
const inst = run("pnpm", ["add", `release-please@${VERSION}`, "--save-exact"], { cwd: tool, env: { CI: "" } });
if (inst.code !== 0) { console.error(inst.out); process.exit(1); }
const require = createRequire(join(tool, "package.json"));
const { Manifest, setLogger } = require("release-please");
const quiet = () => {};
setLogger({ error: quiet, warn: quiet, info: quiet, debug: quiet, trace: quiet }); // 库默认把每一步都打到控制台

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } }).trim();

// 只读本地 git 的 Scm：release-please 在 dry-run 里用到的读取方法；写入方法一律抛错（证明没有写入）
class LocalScm {
  constructor(dir) { this.dir = dir; this.repository = { owner: "local", repo: "runyard", defaultBranch: "main" }; }
  async getFileContents(p) { return this.getFileContentsOnBranch(p, "main"); }
  async getFileContentsOnBranch(p, branch) {
    let text;
    try { text = git(this.dir, "show", `${branch}:${p}`); } catch { const e = new Error(`not found: ${p}`); e.status = 404; throw e; }
    return { sha: git(this.dir, "rev-parse", `${branch}:${p}`), content: Buffer.from(text).toString("base64"), parsedContent: text, mode: "100644" };
  }
  async getFileJson(p, branch) { return JSON.parse((await this.getFileContentsOnBranch(p, branch)).parsedContent); }
  async findFilesByFilename(f, prefix) { return this.findFilesByFilenameAndRef(f, "main", prefix); }
  async findFilesByFilenameAndRef(f, ref, prefix) { return git(this.dir, "ls-tree", "-r", "--name-only", ref).split("\n").filter((x) => x.endsWith(f) && (!prefix || x.startsWith(prefix))); }
  async findFilesByGlob() { return []; }
  async findFilesByGlobAndRef() { return []; }
  async findFilesByExtension(ext, prefix) { return this.findFilesByExtensionAndRef(ext, "main", prefix); }
  async findFilesByExtensionAndRef(ext, ref, prefix) { return git(this.dir, "ls-tree", "-r", "--name-only", ref).split("\n").filter((x) => x.endsWith(`.${ext}`) && (!prefix || x.startsWith(prefix))); }
  async commitsSince() { return []; }
  async *mergeCommitIterator() {
    const shas = git(this.dir, "log", "--first-parent", "--format=%H", "main").split("\n");
    for (const sha of shas) {
      const message = git(this.dir, "log", "-1", "--format=%B", sha).replace(/\n+$/, "");
      const files = git(this.dir, "show", "--name-only", "--format=", sha).split("\n").filter(Boolean);
      yield { sha, message, files };
    }
  }
  async *pullRequestIterator() {}
  async *releaseIterator() {}
  async *tagIterator() {
    for (const line of git(this.dir, "tag", "--list", "--format=%(refname:short) %(objectname) %(*objectname)").split("\n").filter(Boolean)) {
      const [name, obj, deref] = line.split(" ");
      yield { name, sha: deref || obj };
    }
  }
  async getPullRequest() { throw new Error("read-only"); }
}
for (const m of ["createPullRequest", "updatePullRequest", "createRelease", "commentOnIssue", "removeIssueLabels", "addIssueLabels", "createFileOnNewBranch"]) {
  LocalScm.prototype[m] = async () => { throw new Error(`写入被拦截: ${m}`); };
}

const baseConfig = (over = {}) => ({
  // 一个版本号管应用、命令行和所有包：只配根路径 "."，其余 package.json 用 extra-files 同步版本
  packages: {
    ".": {
      "release-type": "node",
      "package-name": "runyard",
      "include-component-in-tag": false,
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true,
      "changelog-path": "CHANGELOG.md",
      "extra-files": [
        { type: "json", path: "apps/desktop/package.json", jsonpath: "$.version" },
        { type: "json", path: "packages/cli/package.json", jsonpath: "$.version" },
      ],
      ...over,
    },
  },
});

// 建一个一次性仓库：首个提交带上起始版本并打标签，然后按顺序提交 commits
async function scenario(name, { start = "0.3.0", commits, config = baseConfig() }) {
  const dir = tempDir("rp-repo");
  git(dir, "init", "-q", "-b", "main");
  write(dir, "package.json", JSON.stringify({ name: "runyard", version: start, private: true }, null, 2));
  write(dir, "apps/desktop/package.json", JSON.stringify({ name: "@runyard/desktop", version: start, private: true }, null, 2));
  write(dir, "packages/cli/package.json", JSON.stringify({ name: "runyard-cli", version: start, private: true }, null, 2));
  write(dir, "CHANGELOG.md", "# Changelog\n");
  write(dir, "release-please-config.json", JSON.stringify(config, null, 2));
  write(dir, ".release-please-manifest.json", JSON.stringify({ ".": start }, null, 2));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "chore: 初始化");
  git(dir, "tag", "-a", `v${start}`, "-m", `v${start}`);
  commits.forEach((c, i) => {
    const file = c.file ?? `packages/core/src/f${i}.ts`;
    write(dir, file, `export const n = ${i};\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", c.message);
  });
  const scm = new LocalScm(dir);
  const manifest = await Manifest.fromManifest(scm, "main");
  let prs;
  try { prs = await manifest.buildPullRequests(); } catch (e) { return { name, error: String(e.stack ?? e).slice(0, 600) }; }
  if (prs.length === 0) return { name, start, result: "不生成发版 PR（没有可发布的提交）" };
  const pr = prs[0];
  return {
    name, start,
    nextVersion: pr.version?.toString(),
    title: pr.title.toString(),
    updatedFiles: pr.updates.map((u) => u.path).sort(),
    changelogBody: pr.body.toString().split("\n").filter((l) => l.trim() && !l.startsWith(":robot:") && !l.startsWith("---")).slice(0, 14),
  };
}

const results = { node: process.version, releasePlease: VERSION, when: new Date().toISOString(), scenarios: [] };
const S = async (...a) => results.scenarios.push(await scenario(...a));
await S("A feat（0.x，patch-for-minor）", { commits: [{ message: "feat(core): 增加运行状态机" }] });
await S("A2 feat（0.x，不开 patch-for-minor）", { commits: [{ message: "feat(core): 增加运行状态机" }], config: baseConfig({ "bump-patch-for-minor-pre-major": false }) });
await S("B fix", { commits: [{ message: "fix(platform): 修复 Windows 上进程树未完全结束" }] });
await S("C feat!（感叹号，0.x）", { commits: [{ message: "feat(cli)!: 移除旧命令" }] });
await S("D 页脚 BREAKING CHANGE: 英文词 + 中文说明", { commits: [{ message: "fix(core): 修复崩溃\n\nBREAKING CHANGE: 配置文件格式改变，需要重新生成" }] });
await S("E 页脚用中文词“破坏性变更：”", { commits: [{ message: "fix(core): 修复崩溃\n\n破坏性变更：配置文件格式改变" }] });
await S("F 全角冒号与全角括号 “feat（core）：增加”", { commits: [{ message: "feat（core）：增加运行状态机" }] });
await S("G 只有 chore/docs/ci（不应发版）", { commits: [{ message: "chore(deps): 升级 vite" }, { message: "docs: 更新手册" }, { message: "ci: 调整流水线" }] });
await S("H 混合：feat + fix + chore + docs", { commits: [{ message: "feat(core): 增加运行状态机" }, { message: "fix(platform): 修复路径问题" }, { message: "chore(deps): 升级 vite" }, { message: "docs(repo): 更新 README" }] });
await S("I 无 scope 的中文主题", { commits: [{ message: "feat: 新增示例模板" }] });
await S("J 1.x：feat -> minor", { start: "1.2.0", commits: [{ message: "feat(core): 增加运行状态机" }] });
await S("K 1.x：fix -> patch", { start: "1.2.0", commits: [{ message: "fix(core): 修复崩溃" }] });
await S("L 1.x：feat! -> major", { start: "1.2.0", commits: [{ message: "feat(core)!: 去掉旧接口" }] });
await S("M 只改了 apps/desktop 和 packages/cli 下的文件（单版本号应当照常发版）", { commits: [{ message: "fix(desktop): 修复窗口闪烁", file: "apps/desktop/src/a.ts" }, { message: "feat(cli): 增加 doctor 命令", file: "packages/cli/src/b.ts" }] });
await S("N 自定义中文章节标题", { commits: [{ message: "feat(core): 增加运行状态机" }, { message: "fix(platform): 修复路径问题" }, { message: "perf(core): 加快启动" }], config: baseConfig({ "changelog-sections": [{ type: "feat", section: "新功能" }, { type: "fix", section: "修复" }, { type: "perf", section: "性能" }, { type: "chore", section: "杂项", hidden: true }] }) });
await S("O 提交主题带 PR 号（squash 合并的真实形态）", { commits: [{ message: "feat(core): 增加运行状态机 (#12)" }] });
saveResult(`release-please-${process.platform}`, results);
for (const s of results.scenarios) console.log(`${s.name} => ${s.nextVersion ?? s.result ?? s.error}`);
