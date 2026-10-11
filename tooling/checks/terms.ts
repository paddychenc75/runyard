import { GLOSSARY_FILE, isAgentDoc, listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// terms：没有用术语表禁用的同义词（技术设计 §9.4）。词表只有一个出处：docs/glossary.md。
// 中文禁用词：查全部说明文件（Markdown）和源码、配置里的注释与字符串，按子串匹配。
// 英文禁用词：查产品代码（packages/、apps/ 下的源码和 JSON），按“标识符里的一个词”匹配
//（camelCase、连字符、下划线都拆开），不查文档正文，因为英文单词在正文里常有别的意思。
// 不查：术语表自己、两份产品文档（它们记录了改名的历史）、设计源文件。
// 界面文案的加强版 i18n-glossary 随 M1 的文案包加入。

export interface Term {
  zh: string;
  id: string;
  bannedZh: string[];
  bannedEn: string[];
}

const cellItems = (cell: string) =>
  cell
    .split("、")
    .map((item) => item.replaceAll("`", "").trim())
    .filter((item) => item !== "" && item !== "—");

// 读术语表里的那张表，按表头的名字找列
export function parseGlossary(text: string): { terms: Term[]; errors: string[] } {
  const terms: Term[] = [];
  let columns: { zh: number; id: number; bannedZh: number; bannedEn: number } | undefined;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.includes("中文术语")) {
      columns = {
        zh: cells.indexOf("中文术语"),
        id: cells.indexOf("代码标识符"),
        bannedZh: cells.indexOf("禁用（中文）"),
        bannedEn: cells.indexOf("禁用（英文）"),
      };
      continue;
    }
    if (columns === undefined || /^:?-+:?$/.test(cells[0] ?? "")) continue;
    terms.push({
      zh: cells[columns.zh] ?? "",
      id: (cells[columns.id] ?? "").replaceAll("`", ""),
      bannedZh: cellItems(cells[columns.bannedZh] ?? ""),
      bannedEn: cellItems(cells[columns.bannedEn] ?? "").map((word) => word.toLowerCase()),
    });
  }
  if (columns === undefined || Object.values(columns).includes(-1)) {
    return {
      terms: [],
      errors: [
        `${GLOSSARY_FILE} 里找不到术语表，或表头缺列。表头必须有这四列：中文术语、代码标识符、禁用（中文）、禁用（英文）。`,
      ],
    };
  }
  return { terms, errors: [] };
}

// 把一行代码拆成小写的词：camelCase、连字符、下划线、点都算分隔
const words = (line: string) =>
  line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);

const SOURCE = /\.(ts|tsx|mts|mjs|js|json|toml|ya?ml)$/;
const isProductCode = (path: string) =>
  (path.startsWith("packages/") || path.startsWith("apps/")) && SOURCE.test(path);
const isSource = (path: string) =>
  SOURCE.test(path) && /^(packages|apps|tooling|\.claude)\//.test(path);

export const terms: Check = {
  name: "terms",
  run(root) {
    const files = listFiles(root);
    if (!files.includes(GLOSSARY_FILE)) {
      return [`找不到 ${GLOSSARY_FILE}。术语表是用词的唯一出处，恢复这个文件。`];
    }
    const { terms: glossary, errors } = parseGlossary(readText(root, GLOSSARY_FILE));
    for (const file of files) {
      if (file === GLOSSARY_FILE || file === "pnpm-lock.yaml") continue;
      const checkZh = isAgentDoc(file) || isSource(file);
      const checkEn = isProductCode(file);
      if (!checkZh && !checkEn) continue;
      readText(root, file)
        .split("\n")
        .forEach((line, index) => {
          const lineWords = checkEn ? words(line) : [];
          for (const term of glossary) {
            const hits = [
              ...term.bannedZh.filter((word) => line.includes(word)),
              ...term.bannedEn.filter((word) => lineWords.includes(word)),
            ];
            for (const word of hits) {
              errors.push(
                `${file}:${index + 1} 用了禁用的词“${word}”。统一的说法是“${term.zh}”，代码里的标识符是 ${term.id}（见 ${GLOSSARY_FILE}）。改成统一的说法。`,
              );
            }
          }
        });
    }
    return errors;
  },
};
