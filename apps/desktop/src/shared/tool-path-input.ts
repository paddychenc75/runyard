/** 第一版的 macOS 完整路径；不展开主目录、环境变量或 shell 表达式。空格属于文件名。 */
export function isToolPathInput(path: string): boolean {
  return (
    path.startsWith("/") &&
    [...path].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
  );
}
