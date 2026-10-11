import { join } from "node:path";
import { codeSpans, isLiveDoc, listFiles, pathExists, readText, repoRoots } from "./docs.ts";
import { type Check, readJson } from "./workspace.ts";

// docs-commands：说明文件里写到的命令真的能跑（技术设计 §9.4）。
// 1. 代码里出现的 pnpm xxx：xxx 必须是根 package.json 的脚本，或 pnpm 自带的命令。
// 2. 代码里出现的 node <仓库路径>：那个文件必须存在。
// 3. 反过来：根 package.json 的每个脚本都要写进命令表 docs/guides/commands.md。
// 决策记录不查（接受后不改正文）。

const COMMANDS_FILE = "docs/guides/commands.md";

// pnpm 自带的命令，不需要在 package.json 里定义
const PNPM_BUILTINS = new Set([
  "install",
  "add",
  "remove",
  "update",
  "audit",
  "exec",
  "why",
  "list",
  "outdated",
]);

export const docsCommands: Check = {
  name: "docs-commands",
  run(root) {
    const files = listFiles(root);
    const roots = repoRoots(files);
    const scripts = Object.keys(
      readJson<{ scripts?: Record<string, string> }>(join(root, "package.json")).scripts ?? {},
    );
    const errors: string[] = [];
    const listed = new Set<string>();
    for (const file of files.filter(isLiveDoc)) {
      for (const span of codeSpans(readText(root, file))) {
        const where = `${file}:${span.line}`;
        for (const match of span.text.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
          const name = match[1] as string;
          if (file === COMMANDS_FILE) listed.add(name);
          if (scripts.includes(name) || PNPM_BUILTINS.has(name)) continue;
          errors.push(
            `${where} 写到的命令 pnpm ${name} 不存在：根 package.json 里没有这个脚本。改成现有的命令（见 ${COMMANDS_FILE}）；如果是以后才有的命令，等加它的那个 PR 再写进说明。`,
          );
        }
        for (const match of span.text.matchAll(/\bnode\s+([\w./-]+)/g)) {
          const path = (match[1] as string).replace(/^\.\//, "");
          if (!roots.has(path.split("/")[0] as string) || pathExists(files, path)) continue;
          errors.push(`${where} 写到的命令 node ${path} 里的文件不存在。改成真实存在的脚本路径。`);
        }
      }
    }
    if (files.includes(COMMANDS_FILE)) {
      for (const name of scripts.filter((script) => !listed.has(script))) {
        errors.push(
          `根 package.json 的脚本 ${name} 没有写进 ${COMMANDS_FILE}。在命令表里加一行 pnpm ${name}，写明它跑什么。`,
        );
      }
    }
    return errors;
  },
};
