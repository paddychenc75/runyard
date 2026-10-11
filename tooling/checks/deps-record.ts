import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  type Check,
  listWorkspacePackages,
  type PackageManifest,
  resolveSpec,
} from "./workspace.ts";

// 每个直接依赖在 docs/architecture/dependencies.md 里都有对应的行（技术设计 §8.6.2、§9.4）。
// 只比对文件，不联网；联网查公告的部分在每晚任务里。

const RECORD_FILE = "docs/architecture/dependencies.md";

interface Row {
  version: string;
  advisory: string;
  why: string;
}

// 单元格去掉加粗和反引号
const clean = (cell: string) => cell.replaceAll("**", "").replaceAll("`", "").trim();

export function parseRecord(text: string): Map<string, Row> {
  const rows = new Map<string, Row>();
  let columns: Record<"pkg" | "version" | "advisory" | "why", number> | undefined;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells[0] === "包") {
      columns = {
        pkg: 0,
        version: cells.indexOf("选定版本"),
        advisory: cells.indexOf("公告查询"),
        why: cells.indexOf("为什么是这个版本"),
      };
      continue;
    }
    if (columns === undefined || /^:?-+:?$/.test(cells[0] ?? "")) continue;
    rows.set(clean(cells[0] ?? ""), {
      version: clean(cells[columns.version] ?? ""),
      advisory: clean(cells[columns.advisory] ?? ""),
      why: cells[columns.why] ?? "",
    });
  }
  return rows;
}

export const depsRecord: Check = {
  name: "deps-record",
  run(root) {
    let rows: Map<string, Row>;
    try {
      rows = parseRecord(readFileSync(join(root, RECORD_FILE), "utf8"));
    } catch {
      return [`缺少 ${RECORD_FILE}。恢复这个文件，见技术设计 §8.6.2。`];
    }
    const workspaceYaml = parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")) as Record<
      string,
      unknown
    >;
    const manifests: PackageManifest[] = [
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest,
      ...listWorkspacePackages(root).map((pkg) => pkg.manifest),
    ];
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const manifest of manifests) {
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
        for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
          if (spec.startsWith("workspace:") || seen.has(dep)) continue;
          seen.add(dep);
          const version = resolveSpec(spec, dep, workspaceYaml);
          const row = rows.get(dep);
          if (row === undefined) {
            errors.push(
              `${dep} 是直接依赖，但 ${RECORD_FILE} 里没有它的行。按技术设计 §8.6.4 第 8 步补一行。`,
            );
          } else if (row.version !== version) {
            errors.push(
              `${dep} 在 package.json 里是 ${String(version)}，${RECORD_FILE} 里写的是 ${row.version}。两边改成一致，并重新走 §8.6.4 的查询步骤。`,
            );
          } else if (row.advisory === "") {
            errors.push(
              `${RECORD_FILE} 里 ${dep} 的“公告查询”一列是空的。写上 A、B、C 三处的查询结果或公告编号。`,
            );
          }
        }
      }
    }
    // 例外行（安全修复例外）必须写出公告编号
    for (const [dep, row] of rows) {
      if (row.why.includes("安全修复例外") && !/GHSA-|CVE-/.test(`${row.advisory} ${row.why}`)) {
        errors.push(
          `${RECORD_FILE} 里 ${dep} 是例外行，但没有公告编号（GHSA-… 或 CVE-…）。补上，见技术设计 §8.6.1 规则 3。`,
        );
      }
    }
    return errors;
  },
};
