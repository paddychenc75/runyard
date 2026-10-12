import { existsSync } from "node:fs";
import { join } from "node:path";
import { listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// platform-contract：Platform 接口的每个成员，契约测试里至少出现一次（技术设计 §7.1、§3.3）。
// 加了成员不写契约测试，就在这里变红。接口在 packages/platform/src/platform.ts，
// 契约测试在 packages/platform/src/contract/。
//
// 解析规则（platform.ts 的写法为它而定，见那个文件的开头注释）：
// `interface Platform` 的直接成员是“成员”；类型是内联对象 `{ … }` 的直接成员是“分组”，
// 分组里的每个成员记成 `分组.成员`。“出现”指契约测试文件里有一个内容恰好等于成员名的字符串字面量，
// 如 describe("exec.spawn", …)。

export const INTERFACE_FILE = "packages/platform/src/platform.ts";
export const CONTRACT_DIR = "packages/platform/src/contract/";

// 去掉注释，字符串内容不动（接口文件里没有含 // 的字符串）
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// 取出 `export interface Platform {` 的大括号里的文本
function interfaceBody(source: string): string | undefined {
  const start = /export\s+interface\s+Platform\s*\{/.exec(source);
  if (start === null) return undefined;
  let depth = 1;
  for (let i = start.index + start[0].length; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(start.index + start[0].length, i);
  }
  return undefined;
}

// 把一段成员列表按“顶层的分号”切成声明。括号只数 () {} []，
// 尖括号不数（`=>` 和泛型里都有），所以带泛型逗号的写法没问题，分号才是边界
function splitDeclarations(body: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if ("({[".includes(char)) depth++;
    if (")}]".includes(char)) depth--;
    if (char === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") result.push(current.trim());
  return result.filter((declaration) => declaration !== "");
}

const MEMBER_NAME = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(\??)\s*([(:<])/;

// 返回接口的全部成员名（分组展开成 分组.成员）；接口找不到返回 undefined
export function listPlatformMembers(source: string): string[] | undefined {
  const body = interfaceBody(stripComments(source));
  if (body === undefined) return undefined;
  const members: string[] = [];
  for (const declaration of splitDeclarations(body)) {
    const match = MEMBER_NAME.exec(declaration);
    if (match === null) continue;
    const name = match[1] as string;
    const rest = declaration.slice(match[0].length - 1);
    const isGroup = match[3] === ":" && /^:\s*\{/.test(rest);
    if (!isGroup) {
      members.push(name);
      continue;
    }
    const open = declaration.indexOf("{");
    const inner = declaration.slice(open + 1, declaration.lastIndexOf("}"));
    for (const child of splitDeclarations(inner)) {
      const childMatch = MEMBER_NAME.exec(child);
      if (childMatch !== null) members.push(`${name}.${childMatch[1]}`);
    }
  }
  return members;
}

// 契约测试里出现过的字符串字面量
function quotedStrings(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    found.add(match[2] as string);
  }
  return found;
}

export function checkPlatformContract(interfaceSource: string, contractTexts: string[]): string[] {
  const members = listPlatformMembers(interfaceSource);
  if (members === undefined || members.length === 0) {
    return [
      `${INTERFACE_FILE} 里找不到 \`export interface Platform {…}\` 或解析不出成员。按文件开头注释的写法（分组用内联对象类型、每个成员单独声明）改回去，见 docs/architecture/platform-interface.md。`,
    ];
  }
  const mentioned = new Set(contractTexts.flatMap((text) => [...quotedStrings(text)]));
  return members
    .filter((member) => !mentioned.has(member))
    .map(
      (member) =>
        `Platform 的成员 ${member} 在 ${CONTRACT_DIR} 的契约测试里没有出现。给它写契约用例（describe("${member}", …)）；暂时没有实现的，加进 pending.contract.ts 的清单。见 docs/architecture/platform-interface.md 第 4 节。`,
    );
}

export const platformContract: Check = {
  name: "platform-contract",
  run(root) {
    if (!existsSync(join(root, INTERFACE_FILE))) return []; // 平台包还没建
    const contractTexts = listFiles(root)
      .filter((file) => file.startsWith(CONTRACT_DIR) && file.endsWith(".ts"))
      .map((file) => readText(root, file));
    return checkPlatformContract(readText(root, INTERFACE_FILE), contractTexts);
  },
};
