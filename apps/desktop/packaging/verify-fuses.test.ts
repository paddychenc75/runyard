import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { E2E_FUSES } from "./fuses.ts";
import { assertFuses, fuseMismatches } from "./verify-fuses.ts";

// 未经改动的 Electron 可执行文件出厂时 nodeCliInspect 是开的、grantFileProtocolExtraPrivileges 也是开的：
// 正好用来证明断言会在开关不符时失败；它也是端到端构建（只有调试参数是开）之外的反例。
const stockElectron = createRequire(import.meta.url)("electron") as string;

describe("断言打好的二进制里的开关", () => {
  it("出厂的 Electron 不满足正式构建的开关，断言抛错并指出是哪几项", async () => {
    const mismatches = await fuseMismatches(stockElectron);
    expect(mismatches.join("\n")).toContain("enableNodeCliInspectArguments：期望 关，实际 开");
    await expect(assertFuses(stockElectron)).rejects.toThrow(/打包开关与技术设计 §6\.5 不符/);
  });

  it("读到的是文件里的真实取值：出厂 Electron 的 runAsNode 与 nodeCliInspect 都是开", async () => {
    // 期望值写成“全部与出厂一致”时，runAsNode 和 nodeCliInspect 两项不报不符
    const mismatches = await fuseMismatches(stockElectron, E2E_FUSES);
    expect(mismatches.join("\n")).not.toContain("runAsNode");
    expect(mismatches.join("\n")).not.toContain("enableNodeCliInspectArguments");
  });
});
