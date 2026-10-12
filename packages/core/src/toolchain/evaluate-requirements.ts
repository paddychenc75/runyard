import type {
  EnvSource,
  ErrorParams,
  Notice,
  Requires,
  RunyardError,
  ToolCheck,
} from "@runyard/protocol";
import type { ToolProbe } from "./detect-tool.ts";
import { judgeVersion } from "./version-compare.ts";

// 把“找到了什么”对照模板的 requires 判定（规格 TOOLCHAIN-DETECTION-03、08、09、10）。纯函数，不碰平台。
//   - 低于下限：TOOL_TOO_OLD（拦住）；高于上限：照常，带 TOOL_VERSION_UNTESTED 提醒；
//   - 缺少：TOOL_MISSING，除非有 fallback 且 fallback 可用，那时不算失败，给 PACKAGE_MANAGER_FALLBACK；
//   - unknown（只读缓存而缓存里没有）不产生错误和提醒，只是“还不知道”。
// 不产生任何安装动作：系统只提示、不代为安装。

export type ToolObservation = ToolProbe | { readonly tool: string; readonly state: "unknown" };

export type ToolchainError = RunyardError<"TOOL_MISSING" | "TOOL_TOO_OLD">;

export interface ToolchainEvaluation {
  /** requires 里的每个工具一项，其后是只作为回退用到的工具 */
  readonly tools: ToolCheck[];
  /** 阻止运行的错误；空数组表示可以运行 */
  readonly errors: ToolchainError[];
  /** TOOL_VERSION_UNTESTED、PACKAGE_MANAGER_FALLBACK（环境提示由门面加在后面） */
  readonly notices: Notice[];
  /** 实际用来代替的工具，如 pnpm 缺则 { wanted: "pnpm", used: "npm" } */
  readonly fallbacks: { readonly wanted: string; readonly used: string }[];
}

function checkOf(
  observation: ToolObservation,
  range: string | undefined,
  source: EnvSource | undefined,
): ToolCheck {
  const base: ToolCheck = {
    tool: observation.tool,
    status: "missing",
    ...(range === undefined ? {} : { required: range }),
    ...(source === undefined ? {} : { source }),
  };
  if (observation.state === "unknown") return { ...base, status: "unknown" };
  if (observation.state === "missing") return base;
  const verdict = range === undefined ? "ok" : judgeVersion(range, observation.version);
  return {
    ...base,
    status: verdict === "too-old" ? "too-old" : "found",
    path: observation.path,
    version: observation.version,
    ...(verdict === "untested" ? { untested: true } : {}),
  };
}

/** 一个工具要检测时，还要顺带检测哪些（回退用的） */
export function toolsToDetect(requires: Requires): string[] {
  const tools = new Set(Object.keys(requires));
  for (const requirement of Object.values(requires)) {
    if (requirement.fallback !== undefined) tools.add(requirement.fallback);
  }
  return [...tools];
}

export function evaluateRequirements(
  requires: Requires,
  observations: ReadonlyMap<string, ToolObservation>,
  source?: EnvSource,
): ToolchainEvaluation {
  const observe = (tool: string): ToolObservation =>
    observations.get(tool) ?? { tool, state: "unknown" };
  const tools: ToolCheck[] = [];
  const errors: ToolchainError[] = [];
  const notices: Notice[] = [];
  const fallbacks: { wanted: string; used: string }[] = [];

  for (const [tool, requirement] of Object.entries(requires)) {
    const check = checkOf(observe(tool), requirement.version, source);
    tools.push(check);
    if (check.status === "too-old") {
      const params: ErrorParams<"TOOL_TOO_OLD"> = {
        tool,
        required: requirement.version,
        found: check.version as string,
      };
      errors.push({
        code: "TOOL_TOO_OLD",
        params,
        debug: `${tool} ${params.found} is older than ${params.required}`,
      });
    } else if (check.untested === true) {
      notices.push({
        code: "TOOL_VERSION_UNTESTED",
        params: { tool, found: check.version as string, required: requirement.version },
      });
    } else if (check.status === "missing") {
      const fallbackTool = requirement.fallback;
      const fallback =
        fallbackTool === undefined
          ? undefined
          : checkOf(observe(fallbackTool), requires[fallbackTool]?.version, source);
      if (fallbackTool !== undefined && fallback?.status === "found") {
        fallbacks.push({ wanted: tool, used: fallbackTool });
        notices.push({
          code: "PACKAGE_MANAGER_FALLBACK",
          params: { wanted: tool, used: fallbackTool },
        });
      } else {
        errors.push({
          code: "TOOL_MISSING",
          params: { tool, required: requirement.version },
          debug: `${tool} was not found (version command failed or printed no version)`,
        });
      }
    }
  }

  // 只作为回退用到的工具也列进结果，让调用方看得到“实际用的是哪个、什么版本”
  for (const { used } of fallbacks) {
    if (tools.some((check) => check.tool === used)) continue;
    tools.push(checkOf(observe(used), requires[used]?.version, source));
  }
  return { tools, errors, notices, fallbacks };
}
