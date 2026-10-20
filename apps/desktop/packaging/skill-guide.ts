import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliCatalogs, createTranslator } from "@runyard/i18n";

/** 构建时从与 CLI 安装相同的正文生成真实文件，供系统默认阅读器打开。 */
export function buildSkillGuide(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const locale of ["en", "zh-CN"] as const) {
    const text = createTranslator({ locale, platform: "darwin", catalogs: cliCatalogs }).t(
      "cli.skillGuide.body",
    );
    if (locale === "zh-CN") writeFileSync(join(outDir, "SKILL.md"), `${text}\n`);
    writeFileSync(join(outDir, locale === "zh-CN" ? "SKILL.zh-CN.md" : "SKILL.en.md"), `${text}\n`);
  }
}
