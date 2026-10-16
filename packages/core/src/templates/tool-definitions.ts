import {
  parseVersionRange,
  readVersionedText,
  type ToolDefinition,
  toolDefinitionFileFormat,
} from "@runyard/protocol";

// 把 templates/tools/<tool>.json 的文件内容读成工具链检测要的 definitions（规格 TEMPLATES-FORMAT-34）。
// 纯函数：读文件夹是调用方的事（仓库脚本、以后的命令行和管理进程）。
// 坏的一份只让这一个工具不可用，其余照常（格式的 recovery 是 skip），所以问题单独返回，不抛错。

export interface ToolDefinitionSource {
  /** 文件名，如 node.json */
  readonly file: string;
  readonly text: string;
}

export type ToolDefinitionProblemKind =
  | "invalid"
  | "newer"
  | "id-mismatch"
  | "duplicate"
  | "pattern-invalid"
  | "supported-invalid";

export interface ToolDefinitionProblem {
  readonly file: string;
  readonly kind: ToolDefinitionProblemKind;
  /** 给开发者看的诊断，不是用户文案 */
  readonly details: readonly string[];
}

export interface ToolDefinitionSet {
  readonly definitions: ReadonlyMap<string, ToolDefinition>;
  readonly problems: readonly ToolDefinitionProblem[];
}

function semanticProblem(
  file: string,
  definition: ToolDefinition,
): ToolDefinitionProblem | undefined {
  if (file !== `${definition.id}.json`)
    return {
      file,
      kind: "id-mismatch",
      details: [`id "${definition.id}" does not match the file name`],
    };
  try {
    new RegExp(definition.detect.pattern);
  } catch (error) {
    return { file, kind: "pattern-invalid", details: [String(error)] };
  }
  const range = parseVersionRange(definition.supported);
  if (!range.ok)
    return {
      file,
      kind: "supported-invalid",
      details: [`"${definition.supported}": ${range.reason}`],
    };
  return undefined;
}

export function parseToolDefinitions(sources: readonly ToolDefinitionSource[]): ToolDefinitionSet {
  const definitions = new Map<string, ToolDefinition>();
  const problems: ToolDefinitionProblem[] = [];
  for (const { file, text } of sources) {
    const result = readVersionedText(toolDefinitionFileFormat, text);
    if (result.status === "newer") {
      problems.push({ file, kind: "newer", details: [`formatVersion ${result.fileVersion}`] });
      continue;
    }
    if (result.status === "corrupt") {
      problems.push({ file, kind: "invalid", details: [result.reason, ...result.details] });
      continue;
    }
    const problem = semanticProblem(file, result.value);
    if (problem !== undefined) problems.push(problem);
    else if (definitions.has(result.value.id))
      problems.push({ file, kind: "duplicate", details: [result.value.id] });
    else definitions.set(result.value.id, result.value);
  }
  return { definitions, problems };
}
