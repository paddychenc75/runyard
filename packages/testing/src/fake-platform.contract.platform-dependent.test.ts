import { absPath } from "@runyard/platform";
import { runContract } from "@runyard/platform/contract";
import { createFakePlatform } from "./fake-platform.ts";

// 假平台过的是真实平台的同一组契约测试。它不启动真实进程，但 paths 沿用 darwin 的 POSIX 路径规则，
// 而契约用例用本机的临时主目录比较路径，在 Windows 的路径写法下不成立，所以带 platform-dependent 后缀（只在 macOS 和 Ubuntu 跑）。
// complete：假平台没有占位成员，所以不跑“占位抛 INTERNAL”那一组；真实现换掉占位、写成真用例后，这里自动跟着跑。
runContract({
  name: "darwin",
  create: (home) => createFakePlatform({ home: absPath(home) }).platform,
  unsupported: new Set(),
  complete: true,
});
