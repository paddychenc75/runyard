import { readText } from "./docs.ts";
import { listProductSources } from "./source-files.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import type { Check } from "./workspace.ts";

// ui-strings：写死的给人看的文字（技术设计 §6.8 第 3、4 层的静态部分）。
// 为什么用 TypeScript 编译器接口：仓库规定注释和测试标题必须是中文，而产品源码里的字符串出现汉字
// 就一定是写死的界面文字。区分“注释里的汉字”和“字符串里的汉字”要懂语法（字符串里可以有 `//`，
// 注释里可以有引号，模板字符串可以嵌套），正则做不到，解析器天然分得清。
//
// 现在查两件事，范围是 isProductSource() 认定的产品源码：
// 1. 字符串字面量、模板字符串、JSX 文字里含汉字、假名、谚文或全角标点；
// 2. 命令行输出口之外直接写 process.stdout.write / process.stderr.write。
//    只有 packages/cli/src/output/ 可以写标准输出，那里的函数只收 Localized。
//
// 协议里的文档字符串（见 DOC_STRING_DIR）不算界面文字。
// 放行：同一行或上一行写 `// i18n-allow: 理由`，理由必填。放行是给“永远不会显示给用户的开发者诊断”
// 留的口子（技术设计 §6.8 第 4 层），不是给界面文字的。
// 第 1、2 层（Biome 的 JSX 规则和 Localized 类型）和第 5 层（伪语言下扫真实页面）见 biome.json
// 与 packages/i18n/AGENTS.md；第 5 层在 M2 随界面加入，现在没有。

const OUTPUT_DIR = "packages/cli/src/output/";
// 协议里的文档字符串：登记表的 summary 和 zod 的 .describe(…) 只用来生成 docs/reference/，
// 不进任何界面或命令行输出。只在 protocol 里认，别的包写这两种形式照样被拦。
const DOC_STRING_DIR = "packages/protocol/src/";
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;
const ALLOW = /^(?:\/\/|\/\*)\s*i18n-allow:(.*?)(?:\*\/)?$/s;

interface Allowance {
  lines: Set<number>;
  missingReason: number[];
}

// 所有注释都附在某个节点前后；走一遍节点把写了 i18n-allow 的注释收集起来
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

// 文档字符串的位置：x.describe("…") 的实参，或属性 summary 的值
function isDocString(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isCallExpression(parent)) {
    return (
      ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "describe"
    );
  }
  return ts.isPropertyAssignment(parent) && parent.name.getText() === "summary";
}

function isStdWrite(node: ts.Node): node is ts.PropertyAccessExpression {
  // process.stdout.write(...) 和 process.stderr.write(...)
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "write") return false;
  const target = node.expression;
  return (
    ts.isPropertyAccessExpression(target) &&
    (target.name.text === "stdout" || target.name.text === "stderr") &&
    ts.isIdentifier(target.expression) &&
    target.expression.text === "process"
  );
}

export function checkUiStrings(path: string, text: string): string[] {
  const file = parseSource(path, text);
  const allow = collectAllowances(file);
  const errors: string[] = allow.missingReason.map(
    (line) =>
      `${path}:${line} 的 i18n-allow 没有写理由。写成 // i18n-allow: 为什么这里的汉字不会显示给用户。`,
  );
  const reported = new Set<string>();
  const report = (line: number, message: string) => {
    const key = `${line}|${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push(`${path}:${line} ${message}`);
  };
  const allowed = (line: number) => allow.lines.has(line) || allow.lines.has(line - 1);
  const literalPart = (node: ts.Node, value: string) => {
    if (!CJK.test(value)) return;
    if (path.startsWith(DOC_STRING_DIR) && isDocString(node)) return;
    const line = lineOf(file, node.getStart(file));
    if (allowed(line)) return;
    report(
      line,
      "的字符串里有汉字，这是写死的给人看的文字。把它写进 packages/i18n/locales/zh-CN/ 和 en/ 的文案，代码里用 t('键')（做法见 docs/guides/add-ui-string.md）；确实不会显示给用户的开发者诊断，同一行或上一行写 // i18n-allow: 理由。",
    );
  };

  visit(file, (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      literalPart(node, node.text);
    } else if (ts.isJsxText(node)) {
      literalPart(node, node.text);
    } else if (isStdWrite(node) && !path.startsWith(OUTPUT_DIR)) {
      report(
        lineOf(file, node.getStart(file)),
        `直接写了 ${node.expression.getText(file)}.write。命令行只许通过 ${OUTPUT_DIR} 里的输出函数打印（它们只收 Localized）：改成调用那里的 out.line() 或 out.data()。`,
      );
    }
  });
  return errors;
}

export const uiStrings: Check = {
  name: "ui-strings",
  run(root) {
    return listProductSources(root).flatMap((file) => checkUiStrings(file, readText(root, file)));
  },
};
