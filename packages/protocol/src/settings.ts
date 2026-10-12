import { z } from "zod";
import { packageManagers } from "./playground.ts";
import { portSchema } from "./primitives.ts";

// 设置里现在能确定形状的字段（docs/architecture/storage.md 2.3）。
// 没放进来的：autoSave、network、theme、language——它们的取值设计没有逐项规定，
// 等设置的规格批准后再加；加字段不升协议版本。默认值是 core 的事，这里不写。
const settingsFields = z.object({
  libraryRoot: z.string().min(1),
  externalEditor: z.string().min(1).optional(),
  packageManager: z.enum(["auto", ...packageManagers]),
  scriptAutoRun: z.boolean(),
  cliIdleStopMinutes: z.number().int().positive(),
  toolPaths: z.record(z.string().min(1), z.string().min(1)).describe("工具名到绝对路径"),
  ports: z.object({ min: portSchema, max: portSchema }).describe("分配端口的范围，含两端"),
  urlNewSkipConfirmForBuiltin: z.boolean(),
  updateCheck: z.boolean(),
});

export const settingsSchema = settingsFields.meta({ id: "Settings" });
export type Settings = z.infer<typeof settingsSchema>;

// settings.set 的入参：只传要改的字段
export const settingsPatchSchema = settingsFields.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
