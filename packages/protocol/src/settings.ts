import { z } from "zod";
import { packageManagers } from "./playground.ts";
import { portSchema } from "./primitives.ts";

export const autoSaveModes = ["delay", "blur", "off"] as const;
export const themeChoices = ["system", "light", "dark"] as const;

// 设置里现在能确定形状的字段（docs/architecture/storage.md 2.3）。
// network（镜像源、代理）随依赖与网络一组（#189）加入；加字段不升协议版本。默认值是管理进程设置存储的事，这里不写。
// autoSave、theme、language 随设置页（desktop/settings，#188）加入。
/** 镜像源和代理的地址：只认 http、https（代理另认 socks5），没有协议或空格的一律不合法（规格 DESKTOP-SETTINGS-14） */
const urlWith = (schemes: string) =>
  z
    .string()
    .trim()
    .max(2048)
    .regex(new RegExp(`^(${schemes})://[^\\s/?#]+[^\\s]*$`, "i"));
export const registryUrlSchema = urlWith("https?");
export const proxyUrlSchema = urlWith("https?|socks5h?");

/** 依赖与网络里的网络部分：没写镜像源或代理就沿用本机配置（.npmrc、环境变量） */
export const networkSettingsSchema = z.object({
  registry: registryUrlSchema.optional().describe("npm 镜像源；没写沿用本机 .npmrc"),
  proxy: proxyUrlSchema.optional().describe("访问网络时使用的代理；没写沿用本机环境"),
  noProxyLocal: z.boolean().describe("检测和访问本机服务（127.0.0.1、localhost）时不走代理"),
});
export type NetworkSettings = z.infer<typeof networkSettingsSchema>;

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
  autoSave: z.enum(autoSaveModes).describe("编辑器自动保存：停止输入后、失去焦点时、关闭"),
  theme: z.enum(themeChoices).describe("界面明暗：跟随系统、浅色、深色"),
  language: z
    .enum(["en", "zh-CN"])
    .optional()
    .describe("桌面应用界面语言；没写就按系统语言（命令行的语言在 cli.json）"),
  network: networkSettingsSchema,
  confirmCloseRunningTab: z.boolean().describe("关闭运行中的标签页前是否确认；“不再提示”关掉它"),
});

export const settingsSchema = settingsFields.meta({ id: "Settings" });
export type Settings = z.infer<typeof settingsSchema>;

// settings.set 的入参：只传要改的字段
export const settingsPatchSchema = settingsFields.partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
