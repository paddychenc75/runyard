import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 基准图的体积预算（技术设计 §6.7）：单张不超过 200 KB，总量不超过 30 MB。
// 基准图提交进 git，历史里每张被替换的旧图都留着，所以体积要卡住；超了先看是不是样例文件太大，
// 预算用完后再考虑 Git LFS。

export const MAX_FILE_BYTES = 200 * 1024;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export interface BaselineFile {
  name: string;
  bytes: number;
}

/** 返回违反预算的说明（一句指令），没有就是空数组 */
export function checkBudget(files: readonly BaselineFile[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".png")) {
      errors.push(`基准图目录里只放 PNG：${file.name} 删掉或移走（docs/guides/ui-visual.md）。`);
    }
    if (file.bytes > MAX_FILE_BYTES) {
      errors.push(
        `${file.name} 有 ${Math.ceil(file.bytes / 1024)} KB，超过单张 200 KB 的预算：缩小这个样例文件里的内容，或拆成两个组件（docs/guides/ui-visual.md）。`,
      );
    }
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > MAX_TOTAL_BYTES) {
    errors.push(
      `基准图合计 ${(total / 1024 / 1024).toFixed(1)} MB，超过 30 MB 的预算：先清理不必要的样例，仍不够再向负责人提 Git LFS（docs/guides/ui-visual.md）。`,
    );
  }
  return errors;
}

export function listBaselines(dir: string): BaselineFile[] {
  try {
    return readdirSync(dir)
      .filter((name) => !name.startsWith("."))
      .sort()
      .map((name) => ({ name, bytes: statSync(join(dir, name)).size }));
  } catch {
    return [];
  }
}
