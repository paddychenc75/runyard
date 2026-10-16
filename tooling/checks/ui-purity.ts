import { existsSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY_FILE, listFiles, readText } from "./docs.ts";
import { parseGlossary } from "./terms.ts";
import { lineOf, parseSource, ts, visit } from "./ts-source.ts";
import { type Check, readJson } from "./workspace.ts";

// ui-purity：packages/ui 不认识产品（技术设计 §3.3、§6.7 规则 2）。
// 查两样：① 文件名和目录名；② .ts/.tsx 里声明出来的名字（函数、类、变量、类型、属性、参数、导入导出的别名）。
// 都按“词”匹配：名字拆成 camelCase、连字符、下划线分开的词，词表里的词（或多词的组合，如 autoClean）
// 作为连续的词出现就报错。组件叫 DataTable，不叫 LibraryTable。
// 为什么只看声明处：使用处的名字来自别的 API（如浏览器的接口），不是 ui 包自己起的；对象字面量的键同理（外部库的配置项）。
// 不查：测试文件的内容（测试里可以造产品场景来证明组件不依赖它们）、node_modules、生成的图标表。
// 词表：术语表“代码标识符”一列，去掉 ui-purity.json 里写明理由的通用词，再加 extraProductWords。

const UI_DIR = "packages/ui";
const CONFIG = "tooling/checks/ui-purity.json";
const CODE = /\.(?:ts|tsx|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts)$/;

interface PurityConfig {
  extraProductWords: string[];
  genericWords: Record<string, string>;
}

export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

// 词表：每一项是一串小写的词（autoClean → ["auto", "clean"]）
export function productTerms(glossary: string, config: PurityConfig): string[][] {
  const ids = parseGlossary(glossary).terms.map(
    (term) => /^[A-Za-z][A-Za-z0-9]*/.exec(term.id)?.[0] ?? "",
  );
  const generic = new Set(Object.keys(config.genericWords).filter((key) => key !== "$comment"));
  return [...ids, ...config.extraProductWords]
    .filter((id) => id !== "" && !generic.has(id))
    .map(splitWords);
}

function hit(name: string, terms: string[][]): string[] | undefined {
  const words = splitWords(name);
  return terms.find((term) =>
    words.some((_, start) => term.every((word, offset) => words[start + offset] === word)),
  );
}

const FIX =
  "改成通用的词（组件叫 DataTable，不叫 LibraryTable）；带产品含义的东西属于 apps/desktop 的功能模块，不在通用组件包里。见技术设计 §6.7 规则 2 和 packages/ui/AGENTS.md。";

export function checkPurityOfPath(path: string, terms: string[][]): string[] {
  const errors: string[] = [];
  const segments = path.split("/").slice(UI_DIR.split("/").length);
  for (const segment of segments) {
    const found = hit(segment, terms);
    if (found !== undefined) {
      errors.push(`${path} 的文件名或目录名里有产品词“${found.join("")}”。${FIX}`);
      break;
    }
  }
  return errors;
}

// 声明处的名字：节点自己的 name 就是这个标识符，或导入导出的别名
function isDeclaredName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
    return parent.propertyName !== undefined && parent.name === node; // 只有别名（as 后面）是本包起的名字
  }
  // 对象字面量的键和 JSX 属性名多半是别人的接口（如 Playwright 配置里的 snapshotPathTemplate），
  // 本包自己起的名字在声明处（接口的属性、变量、函数、类型）已经查过
  if (
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isBindingElement(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isJsxAttribute(parent)
  ) {
    return false;
  }
  return (parent as { name?: ts.Node }).name === node && !ts.isPropertyAccessExpression(parent);
}

export function checkPurityOfCode(path: string, text: string, terms: string[][]): string[] {
  const file = parseSource(path, text);
  const errors: string[] = [];
  const seen = new Set<string>();
  visit(file, (node) => {
    if (!ts.isIdentifier(node) || !isDeclaredName(node)) return;
    const found = hit(node.text, terms);
    const key = `${lineOf(file, node.getStart(file))}|${node.text}`;
    if (found === undefined || seen.has(key)) return;
    seen.add(key);
    errors.push(
      `${path}:${lineOf(file, node.getStart(file))} 的名字 ${node.text} 里有产品词“${found.join("")}”。${FIX}`,
    );
  });
  return errors;
}

function listUiFiles(root: string): string[] {
  const prefix = `${UI_DIR}/`;
  return listFiles(root).filter((file) => file.startsWith(prefix));
}

export const uiPurity: Check = {
  name: "ui-purity",
  run(root) {
    if (!existsSync(join(root, UI_DIR))) return [];
    const terms = productTerms(
      readText(root, GLOSSARY_FILE),
      readJson<PurityConfig>(join(root, CONFIG)),
    );
    const errors: string[] = [];
    for (const file of listUiFiles(root)) {
      errors.push(...checkPurityOfPath(file, terms));
      if (
        CODE.test(file) &&
        !TEST_FILE.test(file) &&
        !file.endsWith(".d.ts") &&
        !file.includes("/generated/")
      ) {
        errors.push(...checkPurityOfCode(file, readText(root, file), terms));
      }
    }
    return errors;
  },
};
