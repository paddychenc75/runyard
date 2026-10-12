import { codeKeyPrefixes } from "../../packages/i18n/build/code-families.ts";
import { readText } from "./docs.ts";
import { listProductSources } from "./source-files.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";

// “键被用到”的定义（i18n-keys 和 i18n-unused 共用）：
// 1. 静态引用：产品源码（isProductSource，不含测试）里 t("键")、x.t("键")，
//    以及 JSX 的 <T k="键" />。参数是字符串字面量或没有插值的模板字符串。
// 2. 代码派生的键族（errors.* notice.* runState.*）：键由 protocol 登记表推出（code-families.ts），
//    不靠扫描；t(`errors.${code}.title`) 这种写法只要前缀是登记的族就合法，但它不让任何键“被用到”。
// 3. platform.<名> 由别的文案里的 {term_<名>} 引用（i18n-unused 里算）。
// 参数是变量（t(key)）的调用不计入：类型系统已经保证键存在，而它也不能让一个键免于“未使用”。

export interface KeyRef {
  file: string;
  line: number;
  key: string;
}
export interface DynamicRef {
  file: string;
  line: number;
  head: string;
}

function literalValue(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

// 拼出来的键：模板字符串或加号，取第一段写死的文字
function dynamicHead(node: ts.Node): string | undefined {
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalValue(node.left);
    if (left !== undefined) return left;
    return dynamicHead(node.left);
  }
  return undefined;
}

export function scanReferences(
  path: string,
  text: string,
): { refs: KeyRef[]; dynamic: DynamicRef[] } {
  const file = parseSource(path, text);
  const refs: KeyRef[] = [];
  const dynamic: DynamicRef[] = [];
  const take = (arg: ts.Node, pos: number) => {
    const value = literalValue(arg);
    if (value !== undefined) {
      refs.push({ file: path, line: lineOf(file, pos), key: value });
      return;
    }
    const head = dynamicHead(arg);
    if (head !== undefined) dynamic.push({ file: path, line: lineOf(file, pos), head });
  };
  visit(file, (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isT =
        (ts.isIdentifier(callee) && callee.text === "t") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "t");
      const first = node.arguments[0];
      if (isT && first !== undefined) take(first, node.getStart(file));
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(file) !== "T") return;
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || attr.name.getText(file) !== "k") continue;
        const init = attr.initializer;
        if (init === undefined) continue;
        const inner =
          ts.isJsxExpression(init) && init.expression !== undefined ? init.expression : init;
        take(inner, attr.getStart(file));
      }
    }
  });
  return { refs, dynamic };
}

export function scanRepoReferences(root: string): { refs: KeyRef[]; dynamic: DynamicRef[] } {
  const refs: KeyRef[] = [];
  const dynamic: DynamicRef[] = [];
  for (const path of listProductSources(root)) {
    const found = scanReferences(path, readText(root, path));
    refs.push(...found.refs);
    dynamic.push(...found.dynamic);
  }
  return { refs, dynamic };
}

export const isFamilyHead = (head: string): boolean =>
  codeKeyPrefixes.some((prefix) => head.startsWith(prefix));
