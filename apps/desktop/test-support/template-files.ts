import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 测试用：读仓库里的内置模板（templates/builtin）

const TEMPLATES = join(process.cwd(), "../../templates/builtin");
const IGNORED_FILES = new Set(["package-lock.json", "pnpm-lock.yaml"]);

export function builtinTemplateIds(): string[] {
  return readdirSync(TEMPLATES).filter((id) => statSync(join(TEMPLATES, id)).isDirectory());
}

/** 新建项目后磁盘上的样子：相对路径到内容，{{name}} 换成项目名 */
export function templateFiles(id: string): Map<string, string> {
  const root = join(TEMPLATES, id, "files");
  const found = new Map<string, string>();
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (!IGNORED_FILES.has(name)) {
        found.set(relative(root, full), readFileSync(full, "utf8").replaceAll("{{name}}", "demo"));
      }
    }
  };
  walk(root);
  return found;
}
