import { z } from "zod";
import { defineFileFormat } from "./file-format.ts";
import { settingsPatchSchema } from "./settings.ts";

// ~/.runyard/settings.json 和 ~/.runyard/cli.json（storage.md 2.3）。
// 未知字段原样保留：autoSave、network、theme、language 的取值还没定（见 settings.ts），
// 现在就以未知字段的身份往返，不会在写回时丢掉。

export const SETTINGS_FILE_VERSION = 1;

// 所有设置字段都可省略：缺的取默认值，默认值是 core 的事
export const settingsFileSchema = settingsPatchSchema
  .extend({ formatVersion: z.literal(SETTINGS_FILE_VERSION) })
  .loose();
export type SettingsFile = z.infer<typeof settingsFileSchema>;

// 坏了回到默认并提示一次
export const settingsFileFormat = defineFileFormat({
  name: "settings.json",
  currentVersion: SETTINGS_FILE_VERSION,
  schema: settingsFileSchema,
  migrations: {},
  recovery: "defaults",
});

export const CLI_FILE_VERSION = 1;

export const cliLocales = ["en", "zh-CN"] as const;
export const cliLocaleSchema = z.enum(cliLocales);
export type CliLocale = z.infer<typeof cliLocaleSchema>;

// 没有 lang 字段就是英文（技术设计 §4.2）。只由 `runyard config set lang` 写；
// --lang 和 RUNYARD_LANG 不写它
export const cliFileSchema = z.looseObject({
  formatVersion: z.literal(CLI_FILE_VERSION),
  lang: cliLocaleSchema.optional(),
});
export type CliFile = z.infer<typeof cliFileSchema>;

export const cliFileFormat = defineFileFormat({
  name: "cli.json",
  currentVersion: CLI_FILE_VERSION,
  schema: cliFileSchema,
  migrations: {},
  recovery: "defaults",
});

export function effectiveCliLocale(file: CliFile | undefined): CliLocale {
  return file?.lang ?? "en";
}
