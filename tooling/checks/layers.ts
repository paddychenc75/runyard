import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { type Check, listWorkspacePackages, type PackageManifest, readJson } from "./workspace.ts";

// 对照 layers.json 核对各包的依赖声明和 tsconfig 引用（技术设计 §3.3）。
// 只读 JSON 文件，不解析源码。

interface LayerRule {
  path: string;
  allow: string[];
  devOnly?: string[];
}
interface Layers {
  packages: Record<string, LayerRule>;
}
interface TsConfig {
  references?: { path: string }[];
}

const RULES_FILE = "tooling/checks/layers.json";

export const layers: Check = {
  name: "layers",
  run(root) {
    const rules = readJson<Layers>(join(root, RULES_FILE)).packages;
    const nameByPath = new Map(Object.entries(rules).map(([name, rule]) => [rule.path, name]));
    const errors: string[] = [];

    // 根 tsconfig 的引用清单，用来确认每个包都被 tsc -b 覆盖到
    let rootRefs: string[] = [];
    try {
      const rootConfig = readJson<TsConfig>(join(root, "tsconfig.json"));
      rootRefs = (rootConfig.references ?? []).map((ref) => posix.normalize(ref.path));
    } catch {
      errors.push(
        "根目录的 tsconfig.json 缺失或不是合法 JSON（不能带注释）。恢复它，见技术设计 §3.3。",
      );
    }

    // 管 packages/ 下的业务包和 apps/desktop；tooling 不在管辖范围。
    // apps/desktop 内部各部分（main、preload、renderer）能导入什么，由 Biome 的 noRestrictedImports 管（biome.json）
    for (const pkg of listWorkspacePackages(root)) {
      if (!pkg.dir.startsWith("packages/") && !pkg.dir.startsWith("apps/")) continue;
      const name = nameByPath.get(pkg.dir);
      if (name === undefined || pkg.manifest.name !== name) {
        errors.push(
          `${pkg.dir} 不在 ${RULES_FILE} 里，或包名（${pkg.manifest.name}）与登记的不一致。先在 layers.json 登记这个包（需要负责人同意并附 ADR），见技术设计 §3.2。`,
        );
        continue;
      }
      errors.push(...checkPackage(root, pkg.dir, pkg.manifest, name, rules, rootRefs));
    }
    return errors;
  },
};

function checkPackage(
  root: string,
  dir: string,
  manifest: PackageManifest,
  name: string,
  rules: Record<string, LayerRule>,
  rootRefs: string[],
): string[] {
  const errors: string[] = [];
  const rule = rules[name] as LayerRule;
  const internal = new Set(Object.keys(rules));

  // 1. package.json 里的内部依赖必须在允许列表里
  const declared = new Set<string>();
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      if (!internal.has(dep)) continue;
      declared.add(dep);
      if (!rule.allow.includes(dep)) {
        errors.push(
          `${dir}/package.json 在 ${field} 里声明了 ${dep}，但 layers.json 不允许 ${name} 依赖它。删掉这个依赖；确实需要的话先改 layers.json（需要负责人同意并附 ADR），见技术设计 §3.2。`,
        );
      } else if (rule.devOnly?.includes(dep) && field !== "devDependencies") {
        errors.push(
          `${dir}/package.json 把 ${dep} 写在 ${field} 里，layers.json 规定它只能是 devDependencies（只在测试里用）。改到 devDependencies，见技术设计 §3.2。`,
        );
      }
    }
  }

  // 2. tsconfig 的 references 要与依赖声明一致
  const tsconfigPath = join(root, dir, "tsconfig.json");
  const refs = new Set<string>();
  if (!existsSync(tsconfigPath)) {
    errors.push(
      `${dir} 没有 tsconfig.json，tsc -b 检查不到它。按 packages/protocol 的写法补上，见技术设计 §3.3。`,
    );
  } else {
    const config = readJson<TsConfig>(tsconfigPath);
    for (const ref of config.references ?? []) {
      const refDir = posix.normalize(posix.join(dir, ref.path));
      const refName = Object.entries(rules).find(([, r]) => r.path === refDir)?.[0];
      if (refName === undefined) continue; // 指向非业务包（如 tooling）的引用不归 layers 管
      refs.add(refName);
      if (!rule.allow.includes(refName)) {
        errors.push(
          `${dir}/tsconfig.json 引用了 ${refName}，但 layers.json 不允许 ${name} 依赖它。删掉这条 reference，见技术设计 §3.3。`,
        );
      }
    }
    for (const dep of declared) {
      if (!refs.has(dep)) {
        errors.push(
          `${dir}/tsconfig.json 缺少对 ${dep} 的 reference，而 package.json 已声明这个依赖。在 references 里补上，否则 tsc -b 查不到越界导入，见技术设计 §3.3。`,
        );
      }
    }
    for (const ref of refs) {
      if (!declared.has(ref)) {
        errors.push(
          `${dir}/tsconfig.json 引用了 ${ref}，但 package.json 没有声明它。两边要一致：补上依赖声明或删掉 reference，见技术设计 §3.3。`,
        );
      }
    }
  }

  // 3. 根 tsconfig 必须引用这个包
  if (!rootRefs.includes(dir)) {
    errors.push(
      `根 tsconfig.json 的 references 里没有 ${dir}，tsc -b 不会检查它。补上，见技术设计 §3.3。`,
    );
  }
  return errors;
}
