import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";
import { createConfig } from "../../tooling/vitest/base.ts";

// 界面测试的共用热身（vitest.setup.tsx）：jsdom 文件的冷启动不挤占第一个用例的时限（#234）
export default mergeConfig(createConfig(), {
  test: {
    setupFiles: [fileURLToPath(new URL("./vitest.setup.tsx", import.meta.url))],
  },
});
