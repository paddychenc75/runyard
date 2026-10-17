import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";
import { createConfig } from "../../tooling/vitest/base.ts";

// 组件测试需要 DOM：整个包用 jsdom，build/ 和 workbench/ 里读文件的测试在 jsdom 下也能用 Node 的模块
export default mergeConfig(createConfig(), {
  test: {
    environment: "jsdom",
    setupFiles: [fileURLToPath(new URL("./vitest.setup.tsx", import.meta.url))],
  },
});
