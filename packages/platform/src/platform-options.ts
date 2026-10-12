import type { AbsPath } from "./path-types.ts";
import type { Arch, Env } from "./platform.ts";

// 创建平台实现时能覆盖的东西。测试用它指向临时目录，绝不碰真实的 ~/Runyard 和 ~/.runyard。
export interface PlatformOptions {
  home: AbsPath;
  arch: Arch;
  profile: "dev" | undefined;
  /** 解析登录环境时子进程继承的环境；默认是本进程的环境。测试用它隔离 ZDOTDIR、XDG 等 */
  baseEnv?: Env;
  /** 直接指定登录 shell，不再向系统查询。测试用它在 zsh、bash、fish 之间切换 */
  loginShell?: AbsPath;
}
