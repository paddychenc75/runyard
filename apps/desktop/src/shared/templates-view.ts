import type {
  LintRule,
  LocalizedText,
  RunnerReady,
  TemplateCategory,
  TemplateExclusionReason,
  TemplateTag,
  ToolStatus,
} from "@runyard/protocol";
import type { DesktopError } from "./library-state.ts";

// 模板页和另存为模板弹窗的数据（规格 desktop/templates-view）。
// 主进程把管理进程的模板记录、运行方式和已有的检测结果整理成这些形状，界面只负责画。

/** 模板页列表的一行 */
export interface TemplatePageRow {
  /** 列表里的唯一键：内置和用户的模板可以同标识（用户的那份是无效的），所以带上来源 */
  key: string;
  id: string;
  source: "builtin" | "user";
  name: LocalizedText;
  description: LocalizedText;
  /** 用户自己的模板一律归在“我的”，不看它自己写的分类 */
  category: TemplateCategory;
  valid: boolean;
  unmaintained: boolean;
  /** 无效的用户模板的第一条问题（规则加字段路径）；有效的是 null */
  problem: { rule: LintRule; path: string } | null;
}

/** “依赖的运行环境”表的一行 */
export interface TemplateToolRow {
  tool: string;
  /** 模板要求的版本范围，如 >=22.18 <27 */
  required: string;
  /** 缺这个工具时改用的另一个（“没有 pnpm 时会改用 npm”）；没有是 null */
  fallback: string | null;
  /** 这台电脑上的版本：只来自已有的检测结果，没检测过或没找到是 null */
  version: string | null;
  /** unknown 是还没检测过（版本和状态都留空） */
  status: ToolStatus;
}

/** “运行方式”：模板的运行器怎么装依赖、怎么启动、怎么判断已就绪；运行器读不出时整块是 null */
export interface TemplateRunView {
  /** 安装依赖的命令（命令是参数数组，这里用空格连成一行展示）；没有安装步骤是 null */
  install: string | null;
  start: string | null;
  ready: RunnerReady | null;
}

export interface TemplateDetailView {
  row: TemplatePageRow;
  tags: TemplateTag[];
  /** 模板文件夹的绝对路径（“在访达中显示”在主进程里用它，界面不拼路径） */
  path: string;
  tools: TemplateToolRow[];
  run: TemplateRunView | null;
  files: string[];
}

/** 另存弹窗里“默认不包含”的一项：依赖目录、.env、构建产物。只列最浅的一层，不进去 */
export interface ExcludedEntry {
  path: string;
  directory: boolean;
  reason: Exclude<TemplateExclusionReason, "internal">;
}

/** 另存弹窗要的一切：项目里的文件、默认不包含的、原模板的运行环境、已被占用的标识 */
export interface SaveTemplatePlan {
  projectName: string;
  /** 默认会进模板的文件（相对路径、正斜杠、已排序） */
  files: string[];
  excluded: ExcludedEntry[];
  /** 原模板的显示名；原模板已不在了是 null（运行环境那一行就不写） */
  templateName: LocalizedText | null;
  /** 沿用的运行环境（工具和版本范围）；原模板不在了是空 */
  requires: { tool: string; version: string }[];
  /** 全部模板的标识（内置和用户的）：标识不能重复 */
  takenIds: string[];
  /** 用户模板目录的显示写法，如 ~/.runyard/templates（底部“保存位置”） */
  userDir: string;
}
export type SaveTemplatePlanResult =
  | { ok: true; plan: SaveTemplatePlan }
  | { ok: false; error: DesktopError };

/** 弹窗交上来的内容；主进程不信任它，逐项校验 */
export interface SaveTemplateRequest {
  /** 项目 id */
  playground: string;
  /** 模板标识 */
  id: string;
  name: string;
  description: string;
  /** 把项目名替换成变量（默认开） */
  replaceName: boolean;
  /** 勾上的默认不包含项 */
  include: string[];
  /** 去掉勾的默认包含项 */
  exclude: string[];
}
export type SaveTemplateResult = { ok: true; id: string } | { ok: false; error: DesktopError };

/** 模板页和另存弹窗的桥方法名（预加载白名单和主进程的映射都用它） */
export const templateMethodNames = [
  "template.list",
  "template.detail",
  "template.reveal",
  "template.savePlan",
  "template.save",
] as const;
export type TemplateMethod = (typeof templateMethodNames)[number];
