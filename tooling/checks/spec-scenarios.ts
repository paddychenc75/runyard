import { listFiles, readText } from "./docs.ts";

// 读取 openspec/specs/ 下的规格文件，给 spec-trace 和 prd-refs 共用（技术设计 §9.6.9）。
// 只认 OpenSpec 的结构：### Requirement、#### Scenario、“来源：”一行、“验证：”一行。

export const SPEC_FILE = /^openspec\/specs\/(.+)\/spec\.md$/;
export const SCENARIO_ID = /^\[([A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2,})\]/;

export interface SpecScenario {
  line: number;
  /** 标题里方括号中的编号；没有写时为 null */
  id: string | null;
  verify: "test" | "manual" | null;
  /** “验证：manual（原因）”里的原因；没写时为空串 */
  reason: string;
}

export interface SpecRequirement {
  line: number;
  name: string;
  /** 要求正文里有没有单独一行的“来源：” */
  hasSource: boolean;
  scenarios: SpecScenario[];
}

export interface ParsedSpec {
  file: string;
  /** 能力路径，如 run/ownership */
  capability: string;
  requirements: SpecRequirement[];
}

// 能力路径对应的编号前缀：run/ownership -> RUN-OWNERSHIP
export function capabilityPrefix(capability: string): string {
  return capability.replaceAll("/", "-").toUpperCase();
}

export function parseSpec(file: string, text: string): ParsedSpec {
  const capability = SPEC_FILE.exec(file)?.[1] ?? file;
  const requirements: SpecRequirement[] = [];
  let scenario: SpecScenario | null = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd();
    const lineNo = index + 1;
    const requirement = /^### Requirement:\s*(.*)$/.exec(line);
    if (requirement !== null) {
      requirements.push({
        line: lineNo,
        name: requirement[1] as string,
        hasSource: false,
        scenarios: [],
      });
      scenario = null;
      return;
    }
    const scenarioHead = /^#### Scenario:\s*(.*)$/.exec(line);
    const current = requirements.at(-1);
    if (scenarioHead !== null && current !== undefined) {
      scenario = {
        line: lineNo,
        id: SCENARIO_ID.exec(scenarioHead[1] as string)?.[1] ?? null,
        verify: null,
        reason: "",
      };
      current.scenarios.push(scenario);
      return;
    }
    if (/^#{1,4}\s/.test(line)) scenario = null;
    if (scenario !== null) {
      const verify = /^- 验证：(test|manual)(?:（(.*)）)?$/.exec(line);
      if (verify !== null) {
        scenario.verify = verify[1] as "test" | "manual";
        scenario.reason = verify[2] ?? "";
      }
    } else if (current !== undefined && /^来源：\S/.test(line)) {
      current.hasSource = true;
    }
  });
  return { file, capability, requirements };
}

export function readSpecs(root: string): ParsedSpec[] {
  return listFiles(root)
    .filter((file) => SPEC_FILE.test(file))
    .map((file) => parseSpec(file, readText(root, file)));
}
