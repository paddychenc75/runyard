import { describe, expect, it } from "vitest";
import type { Platform } from "../platform.ts";
import { isPlatformError } from "../platform-error.ts";
import type { ContractContext } from "./context.ts";

// 尚未有真实现的成员，和实现明确标为“系统不支持”的成员。
// 每一行是一个成员；谁实现了它（#26），就把这一行换成真用例，不留在这里。
// 第二列是负责的 issue，只给读的人看。linux 在 ctx.unsupported 里列出的成员要求抛 NOT_SUPPORTED，
// 其余的要求抛“尚未实现”的 INTERNAL（占位在 posix/pending-areas.ts）。
const rows: readonly (readonly [member: string, owner: string])[] = [
  ["env.load", "#26"],
  ["env.runDefaults", "#26"],
  ["tools.candidates", "#26"],
  ["tools.packageManagers", "#26"],
  ["shell.interactive", "#26"],
  ["desktop.reveal", "桌面应用"],
  ["desktop.openTerminalAt", "桌面应用"],
  ["desktop.openInEditor", "桌面应用"],
  ["cli.installShim", "桌面应用"],
];

function resolve(platform: Platform, member: string): (...args: unknown[]) => unknown {
  const value = member
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], platform);
  if (typeof value !== "function") throw new Error(`${member} 不是函数`);
  return value as (...args: unknown[]) => unknown;
}

function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return undefined;
}

export function pendingContract(ctx: ContractContext): void {
  const platform = ctx.create(process.cwd());
  for (const [member, owner] of rows) {
    const expected = ctx.unsupported.has(member) ? "NOT_SUPPORTED" : "INTERNAL";
    describe(member, () => {
      it(`"${member}" 在 ${ctx.name} 上抛 ${expected}（${owner}）`, () => {
        expect(thrownCode(() => resolve(platform, member)())).toBe(expected);
      });
    });
  }
}
