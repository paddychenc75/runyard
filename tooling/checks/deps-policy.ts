import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { checkAllowlist } from "./allowlist.ts";
import {
  type Check,
  listWorkspacePackages,
  type PackageManifest,
  resolveSpec,
} from "./workspace.ts";

// 依赖安全策略没有被改松或绕开（技术设计 §8.6、§9.4 的 deps-policy）。
// 本次提交实现最小版本；需要扫描源码导入的那一项见文件末尾的说明。

const MIN_RELEASE_AGE = 20160; // 14 天，单位分钟
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const EXACT_WITH_VERSION = /^(@[^/@]+\/)?[^/@]+@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

export const depsPolicy: Check = {
  name: "deps-policy",
  run(root) {
    return [
      ...checkWorkspaceSettings(root),
      ...checkManifests(root),
      ...checkAllowlistFile(root, new Date()),
    ];
  },
};

function checkWorkspaceSettings(root: string): string[] {
  const errors: string[] = [];
  const doc = parseDocument(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const data = (doc.toJS() ?? {}) as Record<string, unknown>;
  const hint = "见技术设计 §8.6.3，不要放松这项设置。";

  const age = data.minimumReleaseAge;
  if (typeof age !== "number" || age < MIN_RELEASE_AGE) {
    errors.push(
      `pnpm-workspace.yaml 的 minimumReleaseAge 必须是不小于 ${MIN_RELEASE_AGE}（14 天，单位分钟）的数字，现在是 ${String(age)}。${hint}`,
    );
  }
  if (data.strictDepBuilds === false) {
    errors.push(`pnpm-workspace.yaml 把 strictDepBuilds 关了。删掉这一行（默认就是开）。${hint}`);
  }
  if ("dangerouslyAllowAllBuilds" in data) {
    errors.push(
      `pnpm-workspace.yaml 出现了 dangerouslyAllowAllBuilds。删掉它，需要运行脚本的包逐个写进 allowBuilds。${hint}`,
    );
  }
  if (data.savePrefix !== "") {
    errors.push(
      `pnpm-workspace.yaml 的 savePrefix 必须是空字符串（写成 savePrefix: ""），现在是 ${JSON.stringify(data.savePrefix)}。${hint}`,
    );
  }
  const allowBuilds = (data.allowBuilds ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(allowBuilds)) {
    if (key.includes("*")) {
      errors.push(
        `pnpm-workspace.yaml 的 allowBuilds 里有通配条目 ${key}。改成具体的包名。${hint}`,
      );
    }
  }

  // minimumReleaseAgeExclude：每条都要带版本号和注释（注释里写公告编号）
  const exclude = doc.get("minimumReleaseAgeExclude", true);
  if (isSeq(exclude)) {
    exclude.items.forEach((item, index) => {
      const value = isScalar(item) ? String(item.value) : "";
      // yaml 库把第一条前面的注释挂在整个列表上，其余条目的注释挂在条目自己身上
      const own = isScalar(item) ? (item.commentBefore ?? item.comment) : undefined;
      const comment = own ?? (index === 0 ? exclude.commentBefore : undefined);
      if (!EXACT_WITH_VERSION.test(value)) {
        errors.push(
          `pnpm-workspace.yaml 的 minimumReleaseAgeExclude 条目 ${value} 没有写精确版本（如 vite@7.3.7）。只许放“包@版本”。${hint}`,
        );
      }
      if (!comment || comment.trim() === "") {
        errors.push(
          `pnpm-workspace.yaml 的 minimumReleaseAgeExclude 条目 ${value} 没有注释。在条目上方写注释，说明对应的公告编号。${hint}`,
        );
      }
    });
  } else if (exclude !== undefined && exclude !== null && !isMap(exclude)) {
    errors.push("pnpm-workspace.yaml 的 minimumReleaseAgeExclude 必须是列表。");
  }

  // catalog 里的版本也必须精确
  for (const [name, version] of Object.entries((data.catalog ?? {}) as Record<string, unknown>)) {
    if (!EXACT.test(String(version))) {
      errors.push(
        `pnpm-workspace.yaml 的 catalog 里 ${name} 的版本 ${String(version)} 不是精确版本。去掉 ^、~、范围，写成 x.y.z。`,
      );
    }
  }
  return errors;
}

function checkManifests(root: string): string[] {
  const errors: string[] = [];
  const workspaceYaml = parseDocument(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
  ).toJS() as Record<string, unknown>;
  const manifests: { dir: string; manifest: PackageManifest }[] = [
    {
      dir: ".",
      manifest: JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest,
    },
    ...listWorkspacePackages(root),
  ];
  for (const { dir, manifest } of manifests) {
    const file = `${dir === "." ? "" : `${dir}/`}package.json`;
    if (dir === "." && !/^pnpm@\d+\.\d+\.\d+$/.test(manifest.packageManager ?? "")) {
      errors.push(
        `${file} 的 packageManager 必须写成精确版本，如 pnpm@11.28.0，现在是 ${String(manifest.packageManager)}。`,
      );
    }
    // peerDependencies 允许写范围，所以不查
    for (const field of DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
        if (spec === "workspace:*") continue;
        const resolved = resolveSpec(spec, dep, workspaceYaml);
        if (resolved === undefined) {
          errors.push(
            `${file} 的 ${field} 里 ${dep} 引用了 ${spec}，但 pnpm-workspace.yaml 的 catalog 里没有它。`,
          );
        } else if (!spec.startsWith("catalog:") && !EXACT.test(resolved)) {
          errors.push(
            `${file} 的 ${field} 里 ${dep} 的版本 ${spec} 不是精确版本。去掉 ^、~、latest 和范围，写成 x.y.z（或 catalog:），见技术设计 §8.6.1 规则 7。`,
          );
        }
      }
    }
  }
  return errors;
}

function checkAllowlistFile(root: string, today: Date): string[] {
  try {
    return checkAllowlist(readFileSync(join(root, "security/allowlist.toml"), "utf8"), today);
  } catch {
    return [
      "缺少 security/allowlist.toml。恢复这个文件（没有条目时只留说明注释），见技术设计 §8.6.3。",
    ];
  }
}

// 未实现（等对应代码出现的那次提交再加）：
// “被 apps/desktop 和命令行在运行时 import 的第三方包写在 devDependencies 里”这一项
// 需要扫描源码导入，此时还没有 apps/desktop 和 packages/cli。
