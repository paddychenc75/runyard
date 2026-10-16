import { readText } from "./docs.ts";
import { listProductSources } from "./source-files.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import type { Check } from "./workspace.ts";

// no-permanent-delete：产品源码不许调用永久删除（规格 LIBRARY-PLAYGROUNDS-24，PRD #prd-retention，决策记录 0010）。
// 用户的项目只能经平台层的 fs.trash 进废纸篓；项目是资产，任何情形下都不做永久删除。
//
// 范围：isProductSource() 认定的产品源码，即 packages/*/src 和 apps/*/src 里不是测试、契约、测试辅助、
// packages/testing 的文件。测试代码清理自己的临时目录不在范围内。
//
// 查什么（用 TypeScript 编译器接口读语法树，不用正则：字符串和注释里提到 rm 不算）：
// 1. 删除调用：任何对象上的 rm、rmSync、rmdir、rmdirSync、unlink、unlinkSync（fs.rm、fsp.rm、fs.promises.rm……），
//    以及从 node:fs、node:fs/promises 具名导入后直接调用的同名函数（含改名导入）；
// 2. 经进程删除：参数数组的第一项是 rm（"rm"、"/bin/rm"、"/usr/bin/rm"），或 spawn、execFile、exec 一类调用的第一个实参
//    是 rm 命令（含 shell 字符串 "rm -rf …"）。
//
// 例外怎么声明：同一行或上一行写 `// delete-allow: 理由`，理由必填（做法同 ui-strings 的 i18n-allow）。
// 合理的例外只有这几类，评审时看理由是否属于它们：
//   - 管理进程自己的临时文件和运行文件（socket、锁文件、pid 文件、临时目录）；
//   - 日志轮转；
//   - 函数刚建的占位和临时文件（写了一半的临时文件、改名前占位的空目录）；
//   - 平台层复制兜底里的那一处（见下）。
// 创建失败留下的半成品不在此列：它走 fs.trash（规格 LIBRARY-PLAYGROUNDS-24 的上下文）。
//
// 平台层的特别规定：packages/platform 里“可能递归删除”的调用（rm、rmSync，以及带选项的 rmdir）只许出现在
// 唯一的一个文件里——卷上没有废纸篓时“复制、核对完整、再删原件”的兜底；加了 delete-allow 也不行。
// 其余单个条目的删除（unlink、不带选项的 rmdir，只能删一个文件或一个空目录）按上面的例外声明即可。

export const ORIGINAL_REMOVAL_SITE =
  "packages/platform/src/darwin/trash/remove-after-verified-copy.ts";
const PLATFORM_PREFIX = "packages/platform/src/";

const REMOVERS = new Set(["rm", "rmSync", "rmdir", "rmdirSync", "unlink", "unlinkSync"]);
const FS_MODULES = new Set(["node:fs", "fs", "node:fs/promises", "fs/promises"]);
const SPAWNERS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"]);
const RM_BINARY = /^(?:\/(?:usr\/)?bin\/)?rm$/;
const RM_SHELL = /^\s*(?:\/(?:usr\/)?bin\/)?rm\s/;
const ALLOW = /^(?:\/\/|\/\*)\s*delete-allow:(.*?)(?:\*\/)?$/s;

const HOW =
  "用户的项目只进废纸篓（platform.fs.trash），平台层里唯一允许“核验过复制之后删除原件”的地方是 " +
  `${ORIGINAL_REMOVAL_SITE}。` +
  "确实要删自己的东西（管理进程的临时文件和运行文件、日志轮转、函数刚建的占位）：同一行或上一行写 // delete-allow: 理由（理由必填，评审会看）。见规格 LIBRARY-PLAYGROUNDS-24 和决策记录 0010。";

interface Allowance {
  lines: Set<number>;
  missingReason: number[];
}

function collectAllowances(file: ts.SourceFile): Allowance {
  const result: Allowance = { lines: new Set(), missingReason: [] };
  const seen = new Set<number>();
  const take = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const match = ALLOW.exec(file.text.slice(range.pos, range.end));
      if (match === null) continue;
      const line = lineOf(file, range.pos);
      if ((match[1] ?? "").trim() === "") result.missingReason.push(line);
      else result.lines.add(line);
    }
  };
  visit(file, (node) => {
    take(ts.getLeadingCommentRanges(file.text, node.pos));
    take(ts.getTrailingCommentRanges(file.text, node.end));
  });
  take(ts.getLeadingCommentRanges(file.text, 0));
  return result;
}

// 从 node:fs 系模块具名导入的删除函数：本地名字 -> 原名字
function importedRemovers(file: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!FS_MODULES.has(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const original = (element.propertyName ?? element.name).text;
      if (REMOVERS.has(original)) result.set(element.name.text, original);
    }
  }
  return result;
}

// 表达式开头的字符串：字面量、"rm -rf " + dir 的左边、模板字符串的头
function leadingText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return leadingText(node.left);
  }
  return undefined;
}

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isIdentifier(callee)) return callee.text;
  return undefined;
}

interface Finding {
  line: number;
  what: string;
  /** 可能递归删除（平台层只许出现在唯一的文件里） */
  recursive: boolean;
}

function findRemovals(file: ts.SourceFile): Finding[] {
  const imported = importedRemovers(file);
  const findings: Finding[] = [];
  const add = (node: ts.Node, what: string, recursive: boolean) =>
    findings.push({ line: lineOf(file, node.getStart(file)), what, recursive });

  visit(file, (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? (imported.get(callee.text) ?? undefined)
          : undefined;
      if (name !== undefined && REMOVERS.has(name)) {
        const isRmdir = name === "rmdir" || name === "rmdirSync";
        const recursive =
          name === "rm" || name === "rmSync" || (isRmdir && node.arguments.length > 1);
        add(
          node,
          `${ts.isPropertyAccessExpression(callee) ? callee.getText(file) : name}(…)`,
          recursive,
        );
      }
      // spawn("rm", …)、exec("rm -rf …")
      const spawner = calleeName(node);
      const first = node.arguments[0];
      const text = first === undefined ? undefined : leadingText(first);
      if (
        spawner !== undefined &&
        SPAWNERS.has(spawner) &&
        text !== undefined &&
        (RM_BINARY.test(text) || RM_SHELL.test(text))
      ) {
        add(node, `${spawner}("${text.trim()}…")`, true);
      }
    }
    // 参数数组 ["rm", "-rf", …]：第一项是 rm 的字符串数组一律报；
    // 命令名列表之类的误报用 delete-allow 声明，不靠放宽判断（放宽会放过 const a = ["rm", f]; spawn(a[0], a.slice(1))）
    if (ts.isArrayLiteralExpression(node)) {
      const first = node.elements[0];
      if (first !== undefined && ts.isStringLiteral(first) && RM_BINARY.test(first.text)) {
        add(node, `参数数组以 "${first.text}" 开头`, true);
      }
    }
  });
  return findings;
}

export function checkNoPermanentDelete(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const allow = collectAllowances(file);
  const errors: string[] = allow.missingReason.map(
    (line) =>
      `${path}:${line} 的 delete-allow 没有写理由。写成 // delete-allow: 删的是什么、为什么不是用户的内容。`,
  );
  const reported = new Set<string>();
  for (const found of findRemovals(file)) {
    const key = `${found.line}|${found.what}`;
    if (reported.has(key)) continue;
    reported.add(key);
    if (found.recursive && path.startsWith(PLATFORM_PREFIX) && path !== ORIGINAL_REMOVAL_SITE) {
      errors.push(
        `${path}:${found.line} 在平台层调用了可能递归删除的 ${found.what}。平台层里这样的调用只许出现在 ${ORIGINAL_REMOVAL_SITE}，加 delete-allow 也不行：要移走用户的文件夹请调用 fs.trash。见决策记录 0010。`,
      );
      continue;
    }
    const allowed = allow.lines.has(found.line) || allow.lines.has(found.line - 1);
    if (allowed) continue;
    errors.push(`${path}:${found.line} 调用了 ${found.what}，这是永久删除。${HOW}`);
  }
  return errors;
}

export const noPermanentDelete: Check = {
  name: "no-permanent-delete",
  run(root) {
    return listProductSources(root).flatMap((file) =>
      checkNoPermanentDelete(file, readText(root, file)),
    );
  },
};
