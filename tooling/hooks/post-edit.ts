import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT, readHookInput } from "./hook-input.ts";

// 每次改完一个文件后的钩子（PostToolUse，匹配 Edit|Write）：
// 只对刚改的那一个文件跑 Biome 的格式化和安全修复（技术设计 §9.3）。
// 还有修不掉的问题时用退出码 2 把报错交给智能体；这不会撤销已经完成的修改。
// 类型检查不在这里做：一次改动常要连改几个文件，中途的类型错误是正常的，放在结束时一起查。

const BIOME_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css)$/;

const file = readHookInput().tool_input?.file_path;
const path = file === undefined ? undefined : relative(REPO_ROOT, file);
const biome = join(REPO_ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");

// 仓库外的文件、Biome 不管的文件类型、还没装依赖：都不处理
if (
  file === undefined ||
  path === undefined ||
  path.startsWith("..") ||
  !BIOME_FILE.test(file) ||
  !existsSync(file) ||
  !existsSync(biome)
) {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [biome, "check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true", file],
  { cwd: REPO_ROOT, encoding: "utf8", timeout: 20_000 },
);
if (result.status !== 0 && result.status !== null) {
  process.stderr.write(
    `Biome 在 ${path} 里发现了不能自动修复的问题，请改掉：\n${result.stdout}${result.stderr}`,
  );
  process.exit(2);
}
