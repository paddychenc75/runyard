import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 隔离名单：偶发失败的测试，修好之前的临时处理（docs/guides/testing.md“偶发失败的规则”）。
// 名单在 tooling/vitest/quarantine.json，每一项必须写原因、issue 编号和到期日；
// 到期日之前这个测试被跳过（quarantine.setup.ts），到期后不再跳过、重新参与失败，
// 同时 `pnpm check` 的 quarantine 检查失败，逼着有人修好它或重新评审延期。
export interface QuarantineEntry {
  /** `<相对仓库根的测试文件>::<describe 标题> > … > <测试标题>` */
  readonly id: string;
  readonly reason: string;
  /** 记录这次偶发失败的 issue 编号（标签 flaky） */
  readonly issue: number;
  /** 到期日，YYYY-MM-DD（含当天） */
  readonly expires: string;
}

// 不用 new URL(…, import.meta.url)：在 jsdom 环境里全局 URL 是 jsdom 的实现，fileURLToPath 不认它（#163）
export const QUARANTINE_FILE = join(dirname(fileURLToPath(import.meta.url)), "quarantine.json");

export function loadQuarantine(path: string = QUARANTINE_FILE): QuarantineEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as QuarantineEntry[];
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isExpired(entry: QuarantineEntry, day: string): boolean {
  return entry.expires < day;
}

export function quarantineId(file: string, titles: readonly string[]): string {
  return `${file.split("\\").join("/")}::${titles.join(" > ")}`;
}

/** 名单格式的错误，空数组表示合格 */
export function validateEntries(entries: unknown, day: string): string[] {
  if (!Array.isArray(entries)) return ["quarantine.json 必须是一个数组。"];
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((raw: Partial<QuarantineEntry>, index) => {
    const at = `quarantine.json 第 ${index + 1} 项`;
    if (typeof raw.id !== "string" || !raw.id.includes("::")) {
      errors.push(`${at}的 id 要写成“测试文件路径::describe 标题 > 测试标题”。`);
      return;
    }
    if (seen.has(raw.id)) errors.push(`${at}（${raw.id}）重复了。`);
    seen.add(raw.id);
    if (typeof raw.reason !== "string" || raw.reason.trim() === "") {
      errors.push(`${at}（${raw.id}）缺 reason：写清它为什么偶发失败。`);
    }
    if (!Number.isInteger(raw.issue)) {
      errors.push(`${at}（${raw.id}）缺 issue：写记录这次偶发失败的 issue 编号。`);
    }
    if (typeof raw.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.expires)) {
      errors.push(`${at}（${raw.id}）的 expires 要写成 YYYY-MM-DD。`);
    } else if (raw.expires < day) {
      errors.push(
        `${at}（${raw.id}）已在 ${raw.expires} 到期：修好这个测试并从名单删掉，或经评审把到期日往后改。见 docs/guides/testing.md。`,
      );
    }
  });
  return errors;
}
