import { z } from "zod";
import { defineFileFormat } from "./file-format.ts";
import { installCommandSchema, officialUrlSchema } from "./install-hint.ts";
import { toolIdSchema } from "./template-file.ts";

// 工具定义（规格 TEMPLATES-FORMAT-34；技术设计 §3.1 的 templates/tools/<tool>.json）。
// 随应用发布的数据：版本支持、检测脚本、安装方式三部分。
// 规格只规定了这三部分和“Go 是 go version、其余是 --version”，字段名和嵌套是本包选的，
// 工具链检测（toolchain/detection）用到别的字段时在这里加。

export const TOOL_DEFINITION_FORMAT_VERSION = 1;

// 检测脚本：在候选可执行文件名后面加 args 执行，用 pattern 的第一个捕获组读出版本号。
// 只有读出了版本号才算找到（规格 TOOLCHAIN-DETECTION 的判定）
export const toolDetectSchema = z.strictObject({
  args: z
    .array(z.string().min(1))
    .min(1)
    .describe("版本命令的参数，如 [--version]；Go 是 [version]"),
  pattern: z.string().min(1).describe("正则，第一个捕获组是版本号"),
});

// 一个系统上的安装方式。提示的选择规则（规格 TEMPLATES-FORMAT-35）：
// 在用版本管理工具的用它的命令；否则有 Homebrew 的给 Homebrew 的命令；两者都没有只给链接；链接始终一起给
export const toolInstallSchema = z.strictObject({
  url: officialUrlSchema,
  versionManagers: z
    .array(z.strictObject({ id: z.string().min(1), command: installCommandSchema }))
    .optional()
    .describe("版本管理工具（如 nvm）的安装命令，按优先顺序"),
  homebrew: z.strictObject({ command: installCommandSchema }).optional(),
});
export type ToolInstall = z.infer<typeof toolInstallSchema>;

export const toolDefinitionSchema = z.strictObject({
  formatVersion: z.literal(TOOL_DEFINITION_FORMAT_VERSION),
  id: toolIdSchema,
  executables: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe("在 PATH 上找的可执行文件名，缺省是 [id]；如 python 找 python3 再找 python"),
  supported: z.string().min(1).describe("应用认识的版本范围，写法同 requires 的 version"),
  detect: toolDetectSchema,
  // 按操作系统分开；第一版只给 macOS，键是 darwin
  install: z.strictObject({ darwin: toolInstallSchema }),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export const toolDefinitionFileFormat = defineFileFormat({
  name: "tool definition",
  currentVersion: TOOL_DEFINITION_FORMAT_VERSION,
  schema: toolDefinitionSchema,
  migrations: {},
  recovery: "skip",
});
