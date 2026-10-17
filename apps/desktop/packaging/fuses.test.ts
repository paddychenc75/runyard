import { describe, expect, it } from "vitest";
import { E2E_FUSES, electronFusesOption, RELEASE_FUSES } from "./fuses.ts";

describe("打包开关取值（技术设计 §6.5、决策记录 0007）", () => {
  it("正式构建：runAsNode 开，调试参数、NODE_OPTIONS、file:// 额外权限关，只从 asar 加载", () => {
    expect(RELEASE_FUSES).toMatchObject({
      runAsNode: true,
      enableNodeCliInspectArguments: false,
      enableNodeOptionsEnvironmentVariable: false,
      grantFileProtocolExtraPrivileges: false,
      onlyLoadAppFromAsar: true,
      enableEmbeddedAsarIntegrityValidation: true,
    });
  });

  it("端到端构建只在调试参数一项上与正式构建不同", () => {
    const differing = Object.keys(RELEASE_FUSES).filter(
      (key) =>
        RELEASE_FUSES[key as keyof typeof RELEASE_FUSES] !==
        E2E_FUSES[key as keyof typeof E2E_FUSES],
    );
    expect(differing).toEqual(["enableNodeCliInspectArguments"]);
    expect(E2E_FUSES.enableNodeCliInspectArguments).toBe(true);
  });

  it("交给 electron-builder 的配置带着重签开关，否则改过开关的包在 macOS 27 上会被杀", () => {
    expect(electronFusesOption(RELEASE_FUSES).resetAdHocDarwinSignature).toBe(true);
  });
});
