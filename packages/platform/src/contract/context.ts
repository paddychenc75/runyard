import type { Platform } from "../platform.ts";

// 契约测试的运行环境：同一组用例对每个实现各跑一遍，每个实现各给一个 ContractContext。
export interface ContractContext {
  /** 实现的名字，如 "darwin"，用作 describe 的标题 */
  readonly name: string;
  /** 每次造一个新实例，主目录指向这次测试自己的临时目录 */
  create(home: string): Platform;
  /** 这个实现明确标为“系统不支持”的成员（抛 NOT_SUPPORTED）。其余成员必须能用 */
  readonly unsupported: ReadonlySet<string>;
}
