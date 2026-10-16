import { isRecord, type LintIssue } from "@runyard/protocol";
import type { TemplateFolder } from "./lint-template.ts";

// Node 类模板（files/ 里有 package.json）的三条额外规则（规格 TEMPLATES-FORMAT-40、41；技术设计 §8.6.5）：
// 依赖是精确版本，pnpm-workspace.yaml 里有 allowBuilds，带锁文件。

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// peerDependencies 本来就写范围，不查
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"] as const;
const lockfiles = ["pnpm-lock.yaml", "package-lock.json"] as const;

function dependencyIssues(packageJson: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const section of dependencySections) {
    const deps = packageJson[section];
    if (!isRecord(deps)) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && exactVersion.test(version)) continue;
      issues.push({
        rule: "version-not-exact",
        path: `files/package.json.${section}.${name}`,
        message: `"${name}" is "${String(version)}"; template dependencies must be an exact version such as 19.3.0`,
      });
    }
  }
  return issues;
}

// 只认顶层键：这个文件只放 allowBuilds，不值得为它引入 YAML 解析器
function hasAllowBuilds(yamlText: string): boolean {
  return yamlText.split(/\r?\n/).some((line) => /^allowBuilds\s*:/.test(line));
}

export function nodeTemplateIssues(folder: TemplateFolder): LintIssue[] {
  const packageText = folder.text("package.json");
  if (packageText === undefined) return [];
  const issues: LintIssue[] = [];
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(packageText);
  } catch {
    issues.push({
      rule: "template-json-invalid",
      path: "files/package.json",
      message: "package.json is not valid JSON",
    });
  }
  if (isRecord(packageJson)) issues.push(...dependencyIssues(packageJson));
  const workspace = folder.text("pnpm-workspace.yaml");
  if (workspace === undefined || !hasAllowBuilds(workspace))
    issues.push({
      rule: "allow-builds-missing",
      path: "files/pnpm-workspace.yaml",
      message: "pnpm-workspace.yaml with allowBuilds is required in a Node template",
    });
  if (!lockfiles.some((name) => folder.has(name)))
    issues.push({
      rule: "lockfile-missing",
      path: "files",
      message: `a Node template needs a lockfile (${lockfiles.join(" or ")})`,
    });
  return issues;
}
