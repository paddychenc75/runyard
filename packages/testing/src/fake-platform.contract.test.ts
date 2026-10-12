import { absPath } from "@runyard/platform";
import { runContract } from "@runyard/platform/contract";
import { createFakePlatform } from "./fake-platform.ts";

// 假平台过的是真实平台的同一组契约测试（不依赖真实系统，所以不带 platform-dependent 后缀，Windows 任务也跑）。
// complete：假平台没有占位成员，所以不跑“占位抛 INTERNAL”那一组；真实现换掉占位、写成真用例后，这里自动跟着跑。
runContract({
  name: "darwin",
  create: (home) => createFakePlatform({ home: absPath(home) }).platform,
  unsupported: new Set(),
  complete: true,
});
