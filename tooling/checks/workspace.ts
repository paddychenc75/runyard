import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

// 各项检查共用的读取工具：只读文件，不联网。

// 一项检查：拿到仓库根目录，返回错误列表（空列表 = 通过）。
// 每条错误写成一句指令：哪里错、怎么改、看哪份文档。
export interface Check {
  name: string;
  run(root: string): string[];
}

export interface PackageManifest {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface WorkspacePackage {
  /** 相对仓库根的目录，如 packages/protocol */
  dir: string;
  manifest: PackageManifest;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readWorkspaceYaml(root: string): Record<string, unknown> {
  return parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")) as Record<string, unknown>;
}

function listChildDirs(root: string, parent: string): string[] {
  try {
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
      .map((entry) => `${parent}/${entry.name}`);
  } catch {
    return []; // 目录还不存在（比如 apps/ 在后面的提交里才有）
  }
}

// 列出带 package.json 的工作区包。tooling 是脚本包，也算；只有 layers 检查不管它。
export function listWorkspacePackages(root: string): WorkspacePackage[] {
  const dirs = [...listChildDirs(root, "apps"), ...listChildDirs(root, "packages"), "tooling"];
  const result: WorkspacePackage[] = [];
  for (const dir of dirs) {
    try {
      result.push({ dir, manifest: readJson<PackageManifest>(join(root, dir, "package.json")) });
    } catch {
      // 没有 package.json 的目录不是包
    }
  }
  return result;
}

// 把 catalog: 引用换成 pnpm-workspace.yaml 里的真实版本；其余原样返回
export function resolveSpec(
  spec: string,
  depName: string,
  workspaceYaml: Record<string, unknown>,
): string | undefined {
  if (!spec.startsWith("catalog:")) return spec;
  const catalogName = spec.slice("catalog:".length);
  const table =
    catalogName === "" || catalogName === "default"
      ? workspaceYaml.catalog
      : (workspaceYaml.catalogs as Record<string, unknown> | undefined)?.[catalogName];
  const value = (table as Record<string, unknown> | undefined)?.[depName];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
