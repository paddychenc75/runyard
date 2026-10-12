import type { AbsPath } from "./path-types.ts";
import type { Arch } from "./platform.ts";

// 创建平台实现时能覆盖的东西。测试用它指向临时目录，绝不碰真实的 ~/Runyard 和 ~/.runyard。
export interface PlatformOptions {
  home: AbsPath;
  arch: Arch;
  profile: "dev" | undefined;
}
