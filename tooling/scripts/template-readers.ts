import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// `turbo --affected` 只按“包目录里的文件变了”算受影响的包，看不到包外的文件；
// 读 `templates/` 数据的包（测试或运行时）不会因为模板变了被选中（#149）。
// 这里把这份“读模板的包”做成清单：模板变了，pnpm verify 就在受影响的包之外再跑这些包。
// 清单是否完整由 template-readers.test.ts 对着源码核对。

export const TEMPLATE_READERS: readonly string[] = [
  "@runyard/core",
  "@runyard/supervisor",
  "runyard", // 命令行包（packages/cli）的包名
];

const TEMPLATES_PREFIX = "templates/";

export function touchesTemplates(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => file.replaceAll("\\", "/").startsWith(TEMPLATES_PREFIX));
}

// 需要额外跑的 turbo 参数：把 --affected 换成对读模板的包的 --filter；不需要时返回 undefined
export function templateReaderArgs(
  forwarded: readonly string[],
  changedFiles: readonly string[],
): string[] | undefined {
  if (!forwarded.includes("--affected") || !touchesTemplates(changedFiles)) return undefined;
  return [
    ...forwarded.filter((arg) => arg !== "--affected"),
    ...TEMPLATE_READERS.map((name) => `--filter=${name}`),
  ];
}

// 源码里（含测试）按“相对本文件定位 + 提到 templates”读模板数据的包名，给测试核对清单用
export function findTemplateReaders(repoRoot: string): string[] {
  const found: string[] = [];
  for (const dir of readdirSync(join(repoRoot, "packages"))) {
    const pkgFile = join(repoRoot, "packages", dir, "package.json");
    let name: string;
    try {
      name = (JSON.parse(readFileSync(pkgFile, "utf8")) as { name: string }).name;
    } catch {
      continue;
    }
    if (sourceFiles(join(repoRoot, "packages", dir, "src")).some(readsTemplates)) found.push(name);
  }
  return found.sort();
}

function readsTemplates(file: string): boolean {
  const text = readFileSync(file, "utf8");
  return text.includes("import.meta") && /["'`/]templates["'`/]/.test(text);
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

// 相对对比基线改了哪些文件（含未提交和未跟踪的）。算不出基线时返回 undefined，调用方按“改了模板”处理（宁多勿漏）
export function changedFilesSinceBase(cwd: string): string[] | undefined {
  const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const candidates = [process.env.TURBO_SCM_BASE, "main", "origin/main"].filter(
    (ref): ref is string => ref !== undefined && ref !== "",
  );
  for (const ref of candidates) {
    const base = git(["merge-base", "HEAD", ref]);
    if (base.status !== 0) continue;
    const tracked = git(["diff", "--name-only", base.stdout.trim()]);
    const untracked = git(["ls-files", "--others", "--exclude-standard"]);
    if (tracked.status !== 0 || untracked.status !== 0) return undefined;
    return [...tracked.stdout.split("\n"), ...untracked.stdout.split("\n")].filter(Boolean);
  }
  return undefined;
}
