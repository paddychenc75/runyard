import { lineOf, parseSource, ts, visit } from "./ts-source.ts";

// platform-branching 的语法部分：补上 AGENTS.md 里点名的另外两类系统分支写法（#64）。
// 和 no-permanent-delete 一样用 TypeScript 语法树读源码，字符串和注释里提到这些写法不算。
//
// 范围：与 platform-branching 相同，packages/ 和 apps/ 下的源码（含测试），packages/platform 与桌面应用
// 主进程的 integration 目录除外（由调用方筛选）。tooling/ 不查：检查脚本、CI 脚本和测试入口本来就要启动 git、
// pnpm 等进程，而 tooling 不是产品代码，不会随产品搬到别的系统；要精确区分“脚本合理启动”和“产品误启动”
// 只能靠逐个声明例外，得不偿失。
//
// 一、直接启动进程：导入（import、require、动态 import）child_process 或 node:child_process。
//    产品代码启动进程只经 platform.exec（参数数组、不经 shell、进程身份是 pid 加启动时间）。
//    只看导入，不猜 Bun.spawn 一类别的写法；测试里写在字符串里交给子进程执行的脚本不是导入，不算。
//
// 二、手写路径分隔符：只抓明确的写法，宁可漏也不误报。
//    1. 传给 node:fs、node:fs/promises、node:path 函数的实参，是用 + 或模板字符串把表达式和以 / 或 \ 开头
//       （或结尾）的字面量拼起来的：`${dir}/a.txt`、dir + "/" + name、`${dir}\\${name}`；
//    2. 任何位置的 + 拼接里用了 path.sep（含 posix.sep、win32.sep）。
//    不查的（误报太多或无法判断）：URL、导入路径、glob、正则、没有传给 fs/path 函数的字符串、
//    `parts.join("/")`（相对路径永远用 /，见 packages/platform/AGENTS.md）、字面量路径 "/tmp/x"。
//    漏掉的写法靠评审；这里不提供例外声明，因为被查的写法都有等价的路径工具写法。

const CHILD_PROCESS = new Set(["child_process", "node:child_process"]);
const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
const PATH_MODULES = new Set([
  "path",
  "node:path",
  "path/posix",
  "node:path/posix",
  "path/win32",
  "node:path/win32",
]);

// 接收路径的 fs 函数。open、watch 这类别处也常见、可能收 URL 的名字不收。
const FS_FUNCTIONS = new Set([
  "readFile",
  "readFileSync",
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "mkdir",
  "mkdirSync",
  "mkdtemp",
  "mkdtempSync",
  "readdir",
  "readdirSync",
  "opendir",
  "stat",
  "statSync",
  "lstat",
  "lstatSync",
  "access",
  "accessSync",
  "existsSync",
  "rename",
  "renameSync",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "symlink",
  "symlinkSync",
  "readlink",
  "readlinkSync",
  "realpath",
  "realpathSync",
  "chmod",
  "chmodSync",
  "utimes",
  "utimesSync",
  "createReadStream",
  "createWriteStream",
]);
const PATH_FUNCTIONS = new Set([
  "join",
  "resolve",
  "normalize",
  "relative",
  "dirname",
  "basename",
  "extname",
  "parse",
  "isAbsolute",
]);

const SEPARATOR_START = /^[/\\]/;
const SEPARATOR_END = /[/\\]$/;

const PROCESS_HOW =
  "产品代码启动进程只经 platform.exec（参数数组、不经 shell），平台层之外不直接用 child_process。缺的能力加进 Platform 接口。见 AGENTS.md 和决策记录 0003。";
const SEPARATOR_HOW =
  "路径用 node:path 的 join、resolve 等拼，不手写 / 或 \\；相对路径用 PosixRelPath。见 packages/platform/AGENTS.md。";

interface ModuleBindings {
  /** 本地名字 -> 来自哪一类模块 */
  roots: Map<string, "fs" | "path">;
  /** 具名导入的函数：本地名字 -> 原名字（带类别） */
  functions: Map<string, { kind: "fs" | "path"; name: string }>;
}

function moduleKind(spec: string): "fs" | "path" | undefined {
  if (FS_MODULES.has(spec)) return "fs";
  if (PATH_MODULES.has(spec)) return "path";
  return undefined;
}

function requireSpecifier(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const arg = node.arguments[0];
  if (arg === undefined || !ts.isStringLiteralLike(arg)) return undefined;
  const callee = node.expression;
  if (ts.isIdentifier(callee) && callee.text === "require") return arg.text;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return arg.text;
  return undefined;
}

function collectBindings(file: ts.SourceFile): ModuleBindings {
  const result: ModuleBindings = { roots: new Map(), functions: new Map() };
  visit(file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const kind = moduleKind(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (kind === undefined || clause === undefined || clause.isTypeOnly) return;
      if (clause.name !== undefined) result.roots.set(clause.name.text, kind);
      const bindings = clause.namedBindings;
      if (bindings === undefined) return;
      if (ts.isNamespaceImport(bindings)) result.roots.set(bindings.name.text, kind);
      else {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          const original = (element.propertyName ?? element.name).text;
          // import { posix } from "node:path"：posix 本身还是 path 模块
          if (kind === "path" && (original === "posix" || original === "win32")) {
            result.roots.set(element.name.text, kind);
          } else result.functions.set(element.name.text, { kind, name: original });
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const spec = requireSpecifier(
        ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer,
      );
      const kind = spec === undefined ? undefined : moduleKind(spec);
      if (kind !== undefined && ts.isIdentifier(node.name)) result.roots.set(node.name.text, kind);
      if (kind !== undefined && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const original =
            element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
          result.functions.set(element.name.text, { kind, name: original });
        }
      }
    }
  });
  return result;
}

function rootIdentifier(expr: ts.Expression): ts.Identifier | undefined {
  let current = expr;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current : undefined;
}

// 这次调用是不是 fs 或 path 的路径函数
function isPathApiCall(call: ts.CallExpression, bindings: ModuleBindings): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    const imported = bindings.functions.get(callee.text);
    if (imported === undefined) return false;
    return (imported.kind === "fs" ? FS_FUNCTIONS : PATH_FUNCTIONS).has(imported.name);
  }
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const root = rootIdentifier(callee.expression);
  const kind = root === undefined ? undefined : bindings.roots.get(root.text);
  if (kind === undefined) return false;
  return (kind === "fs" ? FS_FUNCTIONS : PATH_FUNCTIONS).has(callee.name.text);
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isLiteral(expr: ts.Expression): expr is ts.StringLiteralLike {
  return ts.isStringLiteralLike(expr);
}

// `${a}/b`、`${a}\\${b}`、`/tmp/${name}`：模板里某个替换，前面的文字以分隔符结尾，或后面的文字以分隔符开头
function templateJoinsWithSeparator(node: ts.TemplateExpression): boolean {
  return node.templateSpans.some((span, index) => {
    const before =
      index === 0 ? node.head.text : (node.templateSpans[index - 1]?.literal.text ?? "");
    return SEPARATOR_END.test(before) || SEPARATOR_START.test(span.literal.text);
  });
}

// dir + "/" + name、"/" + name（另一边是表达式，字面量一边以分隔符开头或结尾）
function concatJoinsWithSeparator(node: ts.BinaryExpression): boolean {
  if (node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return false;
  const left = unwrap(node.left);
  const right = unwrap(node.right);
  if (isLiteral(right) && !isLiteral(left) && SEPARATOR_START.test(right.text)) return true;
  if (isLiteral(left) && !isLiteral(right) && SEPARATOR_END.test(left.text)) return true;
  return false;
}

function joinsWithSeparator(arg: ts.Expression): boolean {
  const expr = unwrap(arg);
  if (ts.isTemplateExpression(expr)) return templateJoinsWithSeparator(expr);
  if (ts.isBinaryExpression(expr)) {
    return (
      concatJoinsWithSeparator(expr) ||
      (expr.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (joinsWithSeparator(expr.left) || joinsWithSeparator(expr.right)))
    );
  }
  return false;
}

function isPathSep(expr: ts.Expression, bindings: ModuleBindings): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) {
    const imported = bindings.functions.get(node.text);
    return imported?.kind === "path" && imported.name === "sep";
  }
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "sep") return false;
  const root = rootIdentifier(node.expression);
  return root !== undefined && bindings.roots.get(root.text) === "path";
}

export function checkProcessAndSeparators(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const bindings = collectBindings(file);
  const errors: string[] = [];
  const reported = new Set<string>();
  const report = (node: ts.Node, message: string) => {
    const line = lineOf(file, node.getStart(file));
    if (reported.has(`${line}|${message}`)) return;
    reported.add(`${line}|${message}`);
    errors.push(`${path}:${line} ${message}`);
  };

  visit(file, (node) => {
    // 一、导入 child_process
    let spec: string | undefined;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      spec = node.importClause?.isTypeOnly ? undefined : node.moduleSpecifier.text;
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteral(node.moduleSpecifier)) spec = node.moduleSpecifier.text;
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref) && ts.isStringLiteral(ref.expression)) {
        spec = ref.expression.text;
      }
    } else spec = requireSpecifier(node);
    if (spec !== undefined && CHILD_PROCESS.has(spec)) {
      report(node, `直接使用了 ${spec}（启动进程）。${PROCESS_HOW}`);
    }

    // 二、手写分隔符
    if (ts.isCallExpression(node) && isPathApiCall(node, bindings)) {
      for (const arg of node.arguments) {
        if (joinsWithSeparator(arg)) {
          report(arg, `把路径和分隔符拼在一起传给了 fs 或 path 函数。${SEPARATOR_HOW}`);
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if (isPathSep(node.left, bindings) || isPathSep(node.right, bindings)) {
        report(node, `用 + 把 path.sep 拼进了字符串。${SEPARATOR_HOW}`);
      }
    }
  });
  return errors;
}
