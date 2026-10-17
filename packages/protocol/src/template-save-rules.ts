// 另存为模板时哪些东西默认不进模板（规格 templates/custom“另存时哪些文件进模板”）。
// 判定放在协议包里，是因为两边都要用同一份：管理进程另存时按它挑文件，
// 桌面应用的另存弹窗按它把“默认不包含”分出来并写明原因，不各写一份规则。

export const templateExclusionReasons = ["dependencies", "build", "secret", "internal"] as const;
export type TemplateExclusionReason = (typeof templateExclusionReasons)[number];

// 依赖目录、.git、__pycache__ 在任何深度都不进；构建产物只看项目根（src/build/ 这类源码目录不能被误伤）
const DEPENDENCY_DIRS = new Set(["node_modules", ".venv", "__pycache__"]);
const ROOT_BUILD_DIRS = new Set(["dist", "build", ".next", ".nuxt", ".output"]);
const ENV_FILE = /^\.env(\..+)?$/;

/** 默认不进模板的原因；会进模板就是 null。path 是项目内相对路径，用 / 分隔 */
export function templateDefaultExclusion(
  path: string,
  isDirectory: boolean,
): TemplateExclusionReason | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (!isDirectory) return ENV_FILE.test(base) ? "secret" : null;
  if (DEPENDENCY_DIRS.has(base)) return "dependencies";
  if (base === ".git") return "internal";
  if (!path.includes("/") && ROOT_BUILD_DIRS.has(base)) return "build";
  return null;
}
