import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import type { ToolDefinition } from "@runyard/protocol";
import { parseToolDefinitions } from "./tool-definitions.ts";

/** 读 templates/tools/ 下的工具定义（坏的一份只让这个工具不可用，其余照常） */
export async function readToolDefinitions(
  platform: Platform,
  toolsDir: AbsPath,
): Promise<ReadonlyMap<string, ToolDefinition>> {
  const sources: { file: string; text: string }[] = [];
  for (const file of await platform.fs.listFiles(toolsDir)) {
    if (!file.endsWith(".json")) continue;
    const text = await platform.fs.readText(joinPath(toolsDir, posixRelPath(file)));
    if (text !== null) sources.push({ file, text });
  }
  return parseToolDefinitions(sources).definitions;
}
