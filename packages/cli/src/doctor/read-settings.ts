import { joinPath, type Platform, posixRelPath } from "@runyard/platform";

// doctor 只读设置里的两项：资源库位置和手动指定的工具路径。
// 命令行只读共享文件（storage.md 第 1 节）；坏了或没有就当没有设，不报错、不改写。
export async function readDoctorSettings(
  platform: Platform,
): Promise<{ libraryRoot: string | undefined; toolPaths: Record<string, string> }> {
  const text = await platform.fs.readText(
    joinPath(platform.paths.stateDir, posixRelPath("settings.json")),
  );
  let raw: unknown;
  try {
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    raw = undefined;
  }
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const toolPaths: Record<string, string> = {};
  if (typeof record.toolPaths === "object" && record.toolPaths !== null) {
    for (const [tool, path] of Object.entries(record.toolPaths)) {
      if (typeof path === "string" && path !== "") toolPaths[tool] = path;
    }
  }
  const libraryRoot = typeof record.libraryRoot === "string" ? record.libraryRoot : undefined;
  return { libraryRoot, toolPaths };
}
