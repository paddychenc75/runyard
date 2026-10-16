import type { AbsPath, Platform } from "@runyard/platform";
import type { ToolchainResult } from "../toolchain/toolchain-service.ts";

// 命令的第一个词是工具名时换成检测到的真实路径（技术设计 §4.4 的 run）；
// 不在 requires 里的工具（如运行器直接用 node）再按登录环境找一次，找不到原样保留，交给启动去报错。

export async function resolveExecutable(
  platform: Pick<Platform, "exec">,
  argv: readonly string[],
  checked: ToolchainResult,
  cwd: AbsPath,
  env: Record<string, string>,
): Promise<string[]> {
  const [first, ...rest] = argv;
  if (first === undefined) return [];
  const known = checked.tools.find((tool) => tool.tool === first)?.path;
  if (known !== undefined) return [known, ...rest];
  if (first.includes("/")) return [...argv];
  const found = await platform.exec.which(first, env, cwd);
  return [found ?? first, ...rest];
}
