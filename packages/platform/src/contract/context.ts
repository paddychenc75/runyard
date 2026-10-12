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
   * 这个实现就是当前运行的系统会选的那个。真 socket、内核锁、脱钩的进程只能在“本机的实现”上跑：
   * 比如 Ubuntu 的 CI 上 darwin 实现的文件锁标志不被内核认，那里只跑与系统无关的用例。
   * 不是跳过：这些用例对本机的实现总是跑，每个 CI 系统各验证自己的那一份
   */
  readonly native: boolean;
  /** 实现了接口的全部成员、没有占位（内存版的假平台）：不跑“占位成员抛 INTERNAL”那一组 */
  readonly complete?: boolean;
}
