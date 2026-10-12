import type { Platform } from "../platform.ts";

// 契约测试的运行环境：同一组用例对每个实现各跑一遍，每个实现各给一个 ContractContext。
export interface ContractContext {
  /** 实现的名字，如 "darwin"，用作 describe 的标题 */
  readonly name: string;
  /** 每次造一个新实例，主目录指向这次测试自己的临时目录 */
  create(home: string): Platform;
  /** 这个实现明确标为“系统不支持”的成员（抛 NOT_SUPPORTED）。其余成员必须能用 */
  readonly unsupported: ReadonlySet<string>;
  /**
   * 这个实现就是当前运行的系统。真进程、真端口的契约（exec、proc、ports）只对它注册：
   * linux 的实现在 macOS 上读不了 /proc，darwin 的实现在 Linux 上没有 netstat。
   * 换成别的系统的 CI 时，对应的那个实现就成了 native，同一组用例照样跑
   */
  readonly native: boolean;
}
