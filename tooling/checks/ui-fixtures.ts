import { statSync } from "node:fs";
import { join } from "node:path";
import { listFiles, readText } from "./docs.ts";
import { parseSource, ts, visit } from "./ts-source.ts";
import type { Check } from "./workspace.ts";

// ui-fixtures：每个组件都有样例文件，样例文件和基准图一一对应，基准图不超预算
//（技术设计 §3.3、§6.7“组件工作台和截图回归”）。查五样：
// 1. packages/ui/src/primitives/<名>/ 和 patterns/<名>/ 下的每个组件文件夹都有 <名>.fixture.tsx；
// 2. 样例文件导出 meta 和 samples；
// 3. 功能模块（apps/desktop/src/renderer/features/**/components/）里声明了 variant 或 state 属性的组件有同名样例文件；
// 4. 基准图（packages/ui/visual/__screenshots__/ 下的 .png，文件名以组件名开头，如 Button-light-zh-CN.png）
//    和样例文件一一对应：有基准图而没有样例是错；有样例而没有基准图也是错；
//    基准图只由 CI 在 macos-26 上生成，所以“有样例没基准图”只在基准图目录已经存在时才查
//    （目录由 ui-visual 流水线，#166，第一次提交基准图时建立；之前仓库里根本没有基准图可对）；
// 5. 预算：单张不超过 200 KB，总量不超过 30 MB（技术设计 §6.7 基准图一节）。

const UI_COMPONENTS = /^packages\/ui\/src\/(primitives|patterns)\/([^/]+)\/([^/]+)$/;
const FEATURE_COMPONENT =
  /^apps\/desktop\/src\/renderer\/features\/[^/]+\/components\/(?:.+\/)?([^/]+)\.tsx$/;
const BASELINE_DIR = "packages/ui/visual/__screenshots__/";

export const MAX_BASELINE_BYTES = 200 * 1024;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const GUIDE = "docs/guides/add-ui-component.md 的“写样例”一步";

export function declaresVariantOrState(text: string): boolean {
  const file = parseSource("x.tsx", text);
  let found = false;
  visit(file, (node) => {
    if (
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      (node.name.text === "variant" || node.name.text === "state")
    ) {
      found = true;
    }
  });
  return found;
}

export function checkFixtureModule(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const exported = new Set<string>();
  visit(file, (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) exported.add(decl.name.text);
      }
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) exported.add(element.name.text);
    }
  });
  const missing = ["meta", "samples"].filter((name) => !exported.has(name));
  if (missing.length === 0) return [];
  return [
    `${path} 没有导出 ${missing.join(" 和 ")}。样例文件要导出 meta（名字、所在层、对应画板）和 samples（每个状态一个样例）；见${GUIDE}。`,
  ];
}

interface Baseline {
  path: string;
  component: string;
  bytes: number;
}

export function checkBaselines(
  fixtures: string[],
  baselines: Baseline[],
  baselineDirExists: boolean,
): string[] {
  const errors: string[] = [];
  const fixtureNames = new Set(fixtures);
  for (const baseline of baselines) {
    if (!fixtureNames.has(baseline.component)) {
      errors.push(
        `${baseline.path} 是基准图，但组件 ${baseline.component} 没有样例文件。删掉这张基准图，或补上 ${baseline.component}.fixture.tsx；基准图只由 CI 生成，见${GUIDE}和技术设计 §6.7。`,
      );
    }
    if (baseline.bytes > MAX_BASELINE_BYTES) {
      errors.push(
        `${baseline.path} 有 ${Math.ceil(baseline.bytes / 1024)} KB，超过单张 ${MAX_BASELINE_BYTES / 1024} KB 的预算。缩小样例的画面（减少样例数量或尺寸），再让 CI 重新生成；不要调预算，见技术设计 §6.7 基准图一节。`,
      );
    }
  }
  const total = baselines.reduce((sum, baseline) => sum + baseline.bytes, 0);
  if (total > MAX_TOTAL_BYTES) {
    errors.push(
      `基准图总量 ${(total / 1024 / 1024).toFixed(1)} MB，超过 ${MAX_TOTAL_BYTES / 1024 / 1024} MB 的预算。精简样例后让 CI 重新生成；预算用完再考虑 Git LFS 要先问负责人，见技术设计 §6.7 基准图一节。`,
    );
  }
  if (baselineDirExists) {
    const have = new Set(baselines.map((baseline) => baseline.component));
    for (const name of fixtures) {
      if (!have.has(name)) {
        errors.push(
          `组件 ${name} 有样例文件却没有基准图。给 PR 加 update-ui-baseline 标签，让 CI 在 macos-26 上生成并提交，不要在本地生成；见${GUIDE}。`,
        );
      }
    }
  }
  return errors;
}

export const uiFixtures: Check = {
  name: "ui-fixtures",
  run(root) {
    const files = listFiles(root);
    const errors: string[] = [];

    // 1、2：组件文件夹和样例文件
    const folders = new Map<string, Set<string>>();
    for (const file of files) {
      const match = UI_COMPONENTS.exec(file);
      if (match === null) continue;
      const folder = `packages/ui/src/${match[1]}/${match[2]}`;
      folders.set(folder, (folders.get(folder) ?? new Set()).add(match[3] as string));
    }
    const fixtureNames: string[] = [];
    for (const [folder, names] of folders) {
      const name = folder.slice(folder.lastIndexOf("/") + 1);
      const fixture = `${name}.fixture.tsx`;
      if (!names.has(fixture)) {
        errors.push(
          `${folder} 是组件文件夹，却没有 ${fixture}。补上样例文件，导出 meta 和每个状态的样例，并登记进 packages/ui/workbench/registry.ts；见${GUIDE}。`,
        );
        continue;
      }
      fixtureNames.push(name);
      errors.push(
        ...checkFixtureModule(`${folder}/${fixture}`, readText(root, `${folder}/${fixture}`)),
      );
    }

    // 3：功能模块里带 variant / state 的组件
    const fileSet = new Set(files);
    for (const file of files) {
      const match = FEATURE_COMPONENT.exec(file);
      if (match === null || file.endsWith(".fixture.tsx") || /\.(?:test|spec)\./.test(file))
        continue;
      if (!declaresVariantOrState(readText(root, file))) continue;
      const fixture = file.replace(/\.tsx$/, ".fixture.tsx");
      if (!fileSet.has(fixture)) {
        errors.push(
          `${file} 有 variant 或 state 属性，却没有 ${fixture.slice(fixture.lastIndexOf("/") + 1)}。给每个变体和状态写样例文件；见${GUIDE}和技术设计 §6.7 的组件完成标准。`,
        );
      }
    }

    // 4、5：基准图
    const baselines: Baseline[] = files
      .filter((file) => file.startsWith(BASELINE_DIR) && file.endsWith(".png"))
      .map((file) => ({
        path: file,
        component: /^([A-Z][A-Za-z0-9]*)/.exec(file.slice(file.lastIndexOf("/") + 1))?.[1] ?? file,
        bytes: statSync(join(root, file)).size,
      }));
    const baselineDirExists = files.some((file) => file.startsWith(BASELINE_DIR));
    errors.push(...checkBaselines(fixtureNames, baselines, baselineDirExists));
    return errors;
  },
};
