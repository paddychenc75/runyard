import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// 测试用：在系统临时目录里按 {相对路径: 内容} 造一个假仓库，不碰真实仓库
export function makeRepo(files: Record<string, string | object>): string {
  const root = mkdtempSync(join(tmpdir(), "runyard-check-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

// 设计变量的好仓库片段：直接用真实的 tokens.json（编辑器配色要用到其中几十个变量名，手写一份会很快漂移），
// 加上带两个生成标记的 tokens.md。generate() 会用到它们。
export const TOKENS_GOOD: Record<string, string> = {
  "packages/tokens/src/tokens.json": readFileSync(
    join(import.meta.dirname, "../../packages/tokens/src/tokens.json"),
    "utf8",
  ),
  "docs/design/tokens.md": `# tokens

<!-- generated:tokens 开始（由 pnpm tokens:build 生成，不要手改） -->
<!-- generated:tokens 结束 -->

后文
`,
};

export const GOOD_WORKSPACE = `packages: [packages/*, tooling]
catalog:
  zod: 4.6.5
minimumReleaseAge: 20160
savePrefix: ""
allowBuilds:
  electron: true
`;

// 国际化检查的好仓库：两种语言各一个文案组，一个键有参数和备注，另有 platform 一个键。
// 测试用 {...I18N_GOOD, "要改的路径": 内容} 覆盖，值为 null 的路径会被删掉。
export const I18N_GOOD: Record<string, string | object> = {
  "docs/glossary.md": `| 中文术语 | 代码标识符 | 界面英文 | 禁用（中文） | 禁用（英文） | 出处 |
| --- | --- | --- | --- | --- | --- |
| 项目 | \`playground\` | playground | 沙盒工程 | sandboxy | PRD |
| 模板 | \`template\` | — | — | — | PRD |
`,
  "packages/i18n/locales/zh-CN/library.json": {
    "library.empty.title": "还没有项目",
    "library.summary.body": "共 {count, plural, other {# 个}}项目",
    "library.trash.action": "移到{term_trash}",
  },
  "packages/i18n/locales/en/library.json": {
    "library.empty.title": "No playgrounds yet",
    "library.summary.body": "{count, plural, one {# playground} other {# playgrounds}} in total",
    "library.trash.action": "Move to the {term_trash}",
  },
  "packages/i18n/locales/zh-CN/platform.json": {
    "platform.trash": "{platform, select, other {废纸篓}}",
  },
  "packages/i18n/locales/en/platform.json": {
    "platform.trash": "{platform, select, other {Trash}}",
  },
  "packages/i18n/locales/notes/library.json": {
    "library.summary.body": { count: "项目个数" },
  },
  "packages/i18n/src/use.ts": `export const a = t("library.empty.title");
export const b = t("library.summary.body", { count: 1 });
export const c = t("library.trash.action");
`,
};

export function makeI18nRepo(patch: Record<string, string | object | null> = {}): string {
  const files: Record<string, string | object> = { ...I18N_GOOD };
  for (const [path, content] of Object.entries(patch)) {
    if (content === null) delete files[path];
    else files[path] = content;
  }
  return makeRepo(files);
}
