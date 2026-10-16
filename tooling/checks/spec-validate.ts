import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openspecBin, specEnv } from "../scripts/spec.mjs";
import type { Check } from "./workspace.ts";

// spec-validate：规格和进行中的改动格式正确（技术设计 §9.6.9）。
// 实现就是现成命令 `pnpm spec validate --all --strict --no-interactive`，在被检查的仓库根目录里跑；
// 没有联网（包装脚本关了统计和版本检查），没有 openspec 目录的仓库直接通过。

export function validateOutput(status: number | null, output: string): string[] {
  if (status === 0) return [];
  const failures = output
    .split("\n")
    .filter((line) => /^\s*(✗|×)|\[ERROR\]|\[WARNING\]/.test(line))
    .map((line) => line.trim());
  const detail = failures.length > 0 ? failures.join("；") : output.trim().slice(0, 400);
  return [
    `OpenSpec 严格校验没有通过：${detail || "没有输出，退出码 " + String(status)}。运行 pnpm spec validate --all --strict --no-interactive 看完整报错，按提示改规格格式，不要改检查。`,
  ];
}

export const specValidate: Check = {
  name: "spec-validate",
  run(root) {
    if (!existsSync(join(root, "openspec", "config.yaml"))) return [];
    const result = spawnSync(
      process.execPath,
      [openspecBin(), "validate", "--all", "--strict", "--no-interactive", "--no-color"],
      { cwd: root, env: specEnv(), encoding: "utf8" },
    );
    if (result.error !== undefined) {
      return [`无法运行 OpenSpec：${result.error.message}。先运行 pnpm install。`];
    }
    return validateOutput(result.status, `${result.stdout}\n${result.stderr}`);
  },
};
