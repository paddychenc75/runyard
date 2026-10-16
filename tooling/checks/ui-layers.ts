import { join, posix } from "node:path";
import { listFiles, readText } from "./docs.ts";
import { isProductSource } from "./source-files.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import { collectAllowances } from "./ui-strings.ts";
import { type Check, readJson } from "./workspace.ts";

// ui-layers：界面内部的层次（技术设计 §3.3、§6.7 分层表；规则在 ui-layers.json）和输出口。
// 按目录匹配 import 语句：相对路径先按所在文件解析成仓库内路径，再对照规则的目录前缀。
// 包与包之间谁能依赖谁在 layers.json 和 tsc -b 里，这里只管同一个包或应用的内部。
// 查五样：
// 1. 禁止的导入方向（基础组件导入组合组件、功能模块导入外壳、bridge 导入界面各层……）；
// 2. 功能模块互相导入（features/<甲>/ 导入 features/<乙>/）；
// 3. features/ 和别处碰 window.runyard：全仓库只有 renderer/bridge/ 能碰预加载接口；
// 4. process.stdout.write / process.stderr.write 出现在 packages/cli/src/output/ 之外
//    （M1 由 ui-strings 暂管，M2 起由这里接管，技术设计 §6.8 第 3 层）。
// 范围：packages/、apps/ 下的 .ts .tsx .mts；第 3 条不含测试文件（测试里要替身 window.runyard），
// 第 4 条只看产品源码（packages/*/src、apps/*/src 的非测试文件，source-files.ts），和 ui-strings 原来的范围一致。

interface ForbiddenImport {
  from: string;
  to: string[];
  why: string;
}
interface Rules {
  forbiddenImports: ForbiddenImport[];
  siblingDirs: { parent: string; why: string }[];
  preloadApi: { scope: string[]; allowedIn: string[] };
  stdoutOutlet: { dir: string };
}

const RULES_FILE = "tooling/checks/ui-layers.json";
const CODE = /\.(?:ts|tsx|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts)$/;
const DOC = "技术设计 §6.7 分层表和 tooling/checks/ui-layers.json";

// import / export … from / import("…") / require 的目标，带行号
export function importTargets(file: ts.SourceFile): { specifier: string; line: number }[] {
  const found: { specifier: string; line: number }[] = [];
  visit(file, (node) => {
    let literal: ts.Expression | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      literal = node.moduleSpecifier;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      literal = node.arguments[0];
    }
    if (literal !== undefined && ts.isStringLiteralLike(literal)) {
      found.push({ specifier: literal.text, line: lineOf(file, literal.getStart(file)) });
    }
  });
  return found;
}

// 相对导入解析成仓库内路径；包名导入返回 undefined（不归这里管）
function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  return posix.normalize(posix.join(posix.dirname(from), specifier));
}

const inside = (path: string, dir: string) => path.startsWith(dir) || `${path}/` === dir;

function siblingOf(path: string, parent: string): string | undefined {
  if (!path.startsWith(parent)) return undefined;
  return path.slice(parent.length).split("/")[0];
}

export function isPreloadAccess(node: ts.Node): boolean {
  // window.runyard、globalThis.runyard、self.runyard，以及 window["runyard"]
  const target =
    ts.isPropertyAccessExpression(node) && node.name.text === "runyard"
      ? node.expression
      : ts.isElementAccessExpression(node) &&
          ts.isStringLiteralLike(node.argumentExpression) &&
          node.argumentExpression.text === "runyard"
        ? node.expression
        : undefined;
  return (
    target !== undefined &&
    ts.isIdentifier(target) &&
    ["window", "globalThis", "self"].includes(target.text)
  );
}

function isStdWrite(node: ts.Node): node is ts.PropertyAccessExpression {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "write") return false;
  const target = node.expression;
  return (
    ts.isPropertyAccessExpression(target) &&
    (target.name.text === "stdout" || target.name.text === "stderr") &&
    ts.isIdentifier(target.expression) &&
    target.expression.text === "process"
  );
}

export function checkUiLayers(path: string, text: string, rules: Rules): string[] {
  const file = parseSource(path, text);
  const errors: string[] = [];

  for (const { specifier, line } of importTargets(file)) {
    const target = resolveImport(path, specifier);
    if (target === undefined) continue;
    for (const rule of rules.forbiddenImports) {
      if (inside(path, rule.from) && rule.to.some((dir) => inside(target, dir))) {
        errors.push(
          `${path}:${line} 导入了 ${specifier}，${rule.why}。把这个依赖挪到允许的方向（通用的东西往下放，需要它的东西往上放），或改用属性传进来；见${DOC}。`,
        );
      }
    }
    for (const rule of rules.siblingDirs) {
      const mine = siblingOf(path, rule.parent);
      const theirs = siblingOf(target, rule.parent);
      if (mine !== undefined && theirs !== undefined && mine !== theirs) {
        errors.push(
          `${path}:${line} 的功能模块 ${mine} 导入了功能模块 ${theirs}（${specifier}），${rule.why}。把共用的部分挪到 renderer/shared/，或经应用外壳传数据；见${DOC}。`,
        );
      }
    }
  }

  const { preloadApi, stdoutOutlet } = rules;
  const checkPreload =
    !TEST_FILE.test(path) &&
    preloadApi.scope.some((dir) => inside(path, dir)) &&
    !preloadApi.allowedIn.some((dir) => inside(path, dir));
  const allowed = collectAllowances(file).lines;
  const checkStdout = isProductSource(path) && !inside(path, stdoutOutlet.dir);
  visit(file, (node) => {
    if (checkPreload && isPreloadAccess(node)) {
      errors.push(
        `${path}:${lineOf(file, node.getStart(file))} 直接用了 ${node.getText(file)}。预加载接口只许在 apps/desktop/src/renderer/bridge/ 里碰：在 bridge/ 里加一个带类型的函数，这里改调它；见${DOC}。`,
      );
    }
    if (checkStdout && isStdWrite(node)) {
      const line = lineOf(file, node.getStart(file));
      if (!allowed.has(line) && !allowed.has(line - 1)) {
        errors.push(
          `${path}:${line} 直接写了 ${node.expression.getText(file)}.write。命令行只许通过 ${stdoutOutlet.dir} 里的输出函数打印（它们只收 Localized）：改成调用那里的 out.line() 或 out.data()；确实只写进日志文件、不显示给用户的诊断，同一行或上一行写 // i18n-allow: 理由。见技术设计 §6.8 第 3 层。`,
        );
      }
    }
  });
  return errors;
}

export const uiLayers: Check = {
  name: "ui-layers",
  run(root) {
    const rules = readJson<Rules>(join(root, RULES_FILE));
    return listFiles(root)
      .filter(
        (file) => (file.startsWith("packages/") || file.startsWith("apps/")) && CODE.test(file),
      )
      .filter((file) => !file.includes("/node_modules/") && !file.endsWith(".d.ts"))
      .flatMap((file) => checkUiLayers(file, readText(root, file), rules));
  },
};
