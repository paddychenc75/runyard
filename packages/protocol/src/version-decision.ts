import type { ErrorParams } from "./errors.ts";

// 连上管理进程之后怎么办（技术设计 §5.4；docs/architecture/protocol.md §5 的六行表）。
// 纯函数：输入是握手拿到的版本和构建标识，加上管理进程有几个运行、发现文件里的可执行文件还在不在。

export interface VersionInfo {
  protocol: number;
  minProtocol: number;
  // 版本号加构建时生成的随机串
  build: string;
}

export interface VersionDecisionInput {
  client: VersionInfo;
  supervisor: VersionInfo;
  // 管理进程现在有几个运行（来自 supervisor.info）
  runs: number;
  // 发现文件里记录的可执行文件是否还存在；不存在按“构建标识不同”处理（规格 PROTOCOL-HANDSHAKE-10）
  executableExists: boolean;
}

export type VersionDecision =
  // 直接使用
  | { action: "use" }
  // 没有运行：发 supervisor.shutdown { ifIdle: true, reason: 'upgrade' }，等它退出后启动自己带的
  | { action: "replace" }
  // 有运行，不停任何运行，继续使用旧的；应用据 reason 提示“停止全部运行后会自动更新”
  | { action: "use-outdated"; reason: "build-differs" | "protocol-older" }
  // 不兼容：不继续发请求，报这个错
  | {
      action: "reject";
      error: { code: "SUPERVISOR_OUTDATED"; params: ErrorParams<"SUPERVISOR_OUTDATED"> };
    }
  | {
      action: "reject";
      error: { code: "CLIENT_OUTDATED"; params: ErrorParams<"CLIENT_OUTDATED"> };
    };

export function decideVersionAction(input: VersionDecisionInput): VersionDecision {
  const { client, supervisor, runs, executableExists } = input;

  // 客户端低于管理进程要求的最低版本：不管有没有运行，客户端自己没法用
  if (client.protocol < supervisor.minProtocol) {
    return { action: "reject", error: { code: "CLIENT_OUTDATED", params: {} } };
  }

  if (supervisor.protocol < client.protocol) {
    if (runs === 0) return { action: "replace" };
    if (supervisor.protocol >= client.minProtocol) {
      return { action: "use-outdated", reason: "protocol-older" };
    }
    return { action: "reject", error: { code: "SUPERVISOR_OUTDATED", params: { runs } } };
  }

  // 协议版本相同，或管理进程较新但客户端仍满足它的最低要求：只看构建标识。
  // 较新且满足最低要求的情况表里没有明说；按“向后兼容的新协议只加东西”处理，不去换掉更新的那个
  if (supervisor.protocol > client.protocol) return { action: "use" };
  if (supervisor.build === client.build && executableExists) return { action: "use" };
  if (runs === 0) return { action: "replace" };
  return { action: "use-outdated", reason: "build-differs" };
}
