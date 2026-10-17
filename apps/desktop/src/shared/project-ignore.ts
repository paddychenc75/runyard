// 文件监听和快速打开共用的“不算项目文件”清单（规格 DESKTOP-EDITOR-71：与文件监听忽略的是同一份）。
// 内部文件夹和依赖目录在任意深度都不算；构建产物目录只在项目根下不算，
// 免得把源码里恰好叫 build 的文件夹（如 src/build/）藏起来。

/** 任意深度都忽略的目录名：版本库、应用内部文件夹、依赖目录、Python 的缓存 */
export const IGNORED_ANYWHERE = [
  ".git",
  ".runyard",
  "node_modules",
  ".venv",
  "__pycache__",
] as const;

/** 只在项目根下忽略的目录名：常见构建产物和工具缓存 */
export const IGNORED_AT_ROOT_ONLY = ["dist", "build", ".next", ".nuxt", ".turbo", ".vite"] as const;

const anywhere = new Set<string>(IGNORED_ANYWHERE);
const rootOnly = new Set<string>(IGNORED_AT_ROOT_ONLY);

/** 项目内相对路径（正斜杠）落在被忽略的目录里，或者它自己就是被忽略的目录 */
export function isIgnoredProjectPath(path: string): boolean {
  const segments = path.split("/");
  return segments.some(
    (segment, index) => anywhere.has(segment) || (index === 0 && rootOnly.has(segment)),
  );
}
