import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { iconIsFresh } from "./icon.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("应用图标", () => {
  it("build/icon.png 与 docs/design/logo/final 里的母版逐字节一致", () => {
    // 不一致时运行 pnpm --filter @runyard/desktop package 会重新生成，再提交
    expect(iconIsFresh(repoRoot)).toBe(true);
  });
});
