import { describe, expect, it } from "vitest";
import { playgroundSchema } from "./playground.ts";
import { samplePlayground } from "./sample-data.ts";

describe("Playground 记录", () => {
  it("合法的记录通过；脚本没有端口也合法", () => {
    expect(playgroundSchema.safeParse(samplePlayground).success).toBe(true);
    const { port: _port, ...script } = { ...samplePlayground, kind: "oneshot" };
    expect(playgroundSchema.safeParse(script).success).toBe(true);
  });

  it("缺了 id、路径或种类被拒绝", () => {
    for (const key of ["id", "path", "kind", "autoClean", "createdBy"] as const) {
      const broken: Record<string, unknown> = { ...samplePlayground };
      delete broken[key];
      expect(playgroundSchema.safeParse(broken).success).toBe(false);
    }
  });

  it("模板来源只有 builtin 和 user，包管理器只有 pnpm 和 npm", () => {
    const template = { ...samplePlayground.template, source: "remote" };
    expect(playgroundSchema.safeParse({ ...samplePlayground, template }).success).toBe(false);
    expect(
      playgroundSchema.safeParse({ ...samplePlayground, packageManager: "yarn" }).success,
    ).toBe(false);
  });

  it("自动清理：关闭时不带天数，开启时带正整数天数；天数不能是 0 或小数", () => {
    const withClean = (autoClean: unknown) => ({ ...samplePlayground, autoClean });
    expect(playgroundSchema.safeParse(withClean({ enabled: true, days: 7 })).success).toBe(true);
    expect(playgroundSchema.safeParse(withClean({ enabled: true, days: 0 })).success).toBe(false);
    expect(playgroundSchema.safeParse(withClean({ enabled: true, days: 1.5 })).success).toBe(false);
  });

  it("[LIBRARY-PLAYGROUNDS-27] 找不到文件夹的项目带 missingSince", () => {
    const parsed = playgroundSchema.parse({ ...samplePlayground, missingSince: 1_760_000_300_000 });
    expect(parsed.missingSince).toBe(1_760_000_300_000);
  });
});
