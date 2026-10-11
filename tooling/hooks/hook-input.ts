import { readFileSync } from "node:fs";
import { join } from "node:path";

// Claude Code 钩子共用：读标准输入里的 JSON（钩子收到的事件数据），算出仓库根目录。
// 字段名 2026-10-12 对照官方文档核实（code.claude.com/docs/en/hooks）。
// 钩子脚本都用 Node 直接运行（node 文件.ts），不经过 shell，macOS 和 Windows 都能跑。

export interface HookInput {
  hook_event_name?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; command?: string };
  stop_hook_active?: boolean;
}

// Stop 事件的 stop_hook_active 为 true，表示 Claude Code 已经因为上一次的结束钩子在继续工作。
// 此时钩子必须放行，否则一个一直不通过的检查会让会话永远结束不了。
export function isStopContinuation(input: HookInput): boolean {
  return input.stop_hook_active === true;
}

export function readHookInput(): HookInput {
  try {
    return JSON.parse(readFileSync(0, "utf8")) as HookInput;
  } catch {
    return {}; // 没有输入或不是 JSON：按空事件处理，钩子不该因此拦住任何事
  }
}

// 仓库根：这个文件在 tooling/hooks/ 下，往上两级
export const REPO_ROOT = join(import.meta.dirname, "..", "..");
