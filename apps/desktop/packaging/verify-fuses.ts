import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { type FuseSettings, RELEASE_FUSES } from "./fuses.ts";

// 读打好的可执行文件里真实的开关，与期望值逐项比对。package 任务对正式构建调用它，
// 所以“nodeCliInspect 是关的”断言的是二进制本身，不是配置文件里写了什么。

const OPTION_OF: Record<keyof FuseSettings, FuseV1Options> = {
  runAsNode: FuseV1Options.RunAsNode,
  enableCookieEncryption: FuseV1Options.EnableCookieEncryption,
  enableNodeOptionsEnvironmentVariable: FuseV1Options.EnableNodeOptionsEnvironmentVariable,
  enableNodeCliInspectArguments: FuseV1Options.EnableNodeCliInspectArguments,
  enableEmbeddedAsarIntegrityValidation: FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
  onlyLoadAppFromAsar: FuseV1Options.OnlyLoadAppFromAsar,
  loadBrowserProcessSpecificV8Snapshot: FuseV1Options.LoadBrowserProcessSpecificV8Snapshot,
  grantFileProtocolExtraPrivileges: FuseV1Options.GrantFileProtocolExtraPrivileges,
};

/** 返回与期望不符的开关（空数组表示全部相符） */
export async function fuseMismatches(
  executable: string,
  expected: Readonly<FuseSettings> = RELEASE_FUSES,
): Promise<string[]> {
  const wire = await getCurrentFuseWire(executable);
  const mismatches: string[] = [];
  for (const name of Object.keys(OPTION_OF) as (keyof FuseSettings)[]) {
    const actual = wire[OPTION_OF[name]] === FuseState.ENABLE;
    if (actual !== expected[name]) {
      mismatches.push(
        `${name}：期望 ${expected[name] ? "开" : "关"}，实际 ${actual ? "开" : "关"}`,
      );
    }
  }
  return mismatches;
}

export async function assertFuses(
  executable: string,
  expected: Readonly<FuseSettings> = RELEASE_FUSES,
): Promise<void> {
  const mismatches = await fuseMismatches(executable, expected);
  if (mismatches.length > 0) {
    throw new Error(`${executable} 的打包开关与技术设计 §6.5 不符：\n${mismatches.join("\n")}`);
  }
}
