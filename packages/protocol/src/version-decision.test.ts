import { describe, expect, it } from "vitest";
import { decideVersionAction, type VersionDecisionInput } from "./version-decision.ts";

// 默认：双方协议版本 2、最低 1、构建相同、没有运行、可执行文件在
function input(over: {
  client?: Partial<VersionDecisionInput["client"]>;
  supervisor?: Partial<VersionDecisionInput["supervisor"]>;
  runs?: number;
  executableExists?: boolean;
}): VersionDecisionInput {
  return {
    client: { protocol: 2, minProtocol: 1, build: "1.0.0+aaa", ...over.client },
    supervisor: { protocol: 2, minProtocol: 1, build: "1.0.0+aaa", ...over.supervisor },
    runs: over.runs ?? 0,
    executableExists: over.executableExists ?? true,
  };
}

describe("版本比对", () => {
  it("[PROTOCOL-HANDSHAKE-07] 协议版本和构建标识都相同：直接用", () => {
    expect(decideVersionAction(input({ runs: 3 }))).toEqual({ action: "use" });
  });

  it("[PROTOCOL-HANDSHAKE-08] 构建标识不同且没有运行：换新", () => {
    expect(decideVersionAction(input({ supervisor: { build: "1.0.0+bbb" } }))).toEqual({
      action: "replace",
    });
  });

  it("[PROTOCOL-HANDSHAKE-09] 构建标识不同且有运行：沿用并提示，不换", () => {
    expect(decideVersionAction(input({ supervisor: { build: "1.0.0+bbb" }, runs: 2 }))).toEqual({
      action: "use-outdated",
      reason: "build-differs",
    });
  });

  it("[PROTOCOL-HANDSHAKE-10] 可执行文件已不存在按构建标识不同处理", () => {
    expect(decideVersionAction(input({ executableExists: false }))).toEqual({ action: "replace" });
    expect(decideVersionAction(input({ executableExists: false, runs: 1 }))).toEqual({
      action: "use-outdated",
      reason: "build-differs",
    });
  });

  it("[PROTOCOL-HANDSHAKE-11] 管理进程较旧且没有运行：换新", () => {
    expect(decideVersionAction(input({ supervisor: { protocol: 1 } }))).toEqual({
      action: "replace",
    });
  });

  it("[PROTOCOL-HANDSHAKE-12] 管理进程较旧、有运行、仍满足最低要求：兼容使用", () => {
    expect(
      decideVersionAction(
        input({ supervisor: { protocol: 1 }, client: { minProtocol: 1 }, runs: 2 }),
      ),
    ).toEqual({ action: "use-outdated", reason: "protocol-older" });
  });

  it("[PROTOCOL-HANDSHAKE-13] 管理进程较旧、有运行、不满足最低要求：SUPERVISOR_OUTDATED 带运行个数", () => {
    expect(
      decideVersionAction(
        input({ supervisor: { protocol: 1 }, client: { minProtocol: 2 }, runs: 3 }),
      ),
    ).toEqual({ action: "reject", error: { code: "SUPERVISOR_OUTDATED", params: { runs: 3 } } });
  });

  it("[PROTOCOL-HANDSHAKE-14] 客户端低于管理进程的最低要求：CLIENT_OUTDATED，与有无运行无关", () => {
    const expected = { action: "reject", error: { code: "CLIENT_OUTDATED", params: {} } };
    const server = { protocol: 3, minProtocol: 3 };
    expect(decideVersionAction(input({ supervisor: server }))).toEqual(expected);
    expect(decideVersionAction(input({ supervisor: server, runs: 5 }))).toEqual(expected);
  });

  it("管理进程较新但客户端仍满足它的最低要求：直接用（表里没有这一行，见 PR 说明）", () => {
    expect(
      decideVersionAction(input({ supervisor: { protocol: 3, minProtocol: 2 }, runs: 1 })),
    ).toEqual({ action: "use" });
  });
});
