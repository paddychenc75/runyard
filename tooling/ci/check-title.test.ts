import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkTitle, shouldSkipCommit } from "./check-title.ts";

const script = join(import.meta.dirname, "check-title.ts");

describe("checkTitle", () => {
  it.each([
    "feat(core): 增加运行状态机",
    "fix(platform): 修复 Windows 上进程树未完全结束",
    "chore(repo): 搭建 monorepo 工具链",
    "ci(repo): 增加 PR 流水线",
    "docs: 补充贡献说明",
    "feat(cli)!: 删除旧参数",
  ])("合格：%s", (title) => {
    expect(checkTitle(title)).toEqual([]);
  });

  it("不是 type(scope): 主题 的形状", () => {
    expect(checkTitle("增加运行状态机")[0]).toContain("不符合");
    expect(checkTitle("feat(core):没有空格")[0]).toContain("不符合");
    expect(checkTitle("Feat(core): 大写 type")[0]).toContain("不符合");
  });

  it("type(scope) 后面用全角冒号：给出明确的提示", () => {
    for (const title of [
      "feat(core)：增加运行状态机",
      "docs：补充说明",
      "feat(cli)!：删除旧参数",
    ]) {
      const errors = checkTitle(title);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("全角冒号");
      expect(errors[0]).toContain("半角冒号");
    }
  });

  it("主题里出现全角冒号不算错", () => {
    expect(checkTitle("docs(repo): 说明：全角冒号写在主题里没问题")).toEqual([]);
  });

  it("type 不在列表里", () => {
    expect(checkTitle("feature(core): 增加")[0]).toContain("type");
  });

  it("scope 不在列表里", () => {
    expect(checkTitle("feat(unknown): 增加")[0]).toContain("scope");
  });

  it("主题为空或只有空白", () => {
    expect(checkTitle("feat(core): ").some((e) => e.includes("主题是空的"))).toBe(true);
    expect(checkTitle("feat(core):   ").some((e) => e.includes("主题是空的"))).toBe(true);
  });

  it("按字符数算长度：72 个汉字加前缀超限，恰好 72 通过", () => {
    const prefix = "feat(core): "; // 12 个字符
    expect(checkTitle(prefix + "字".repeat(60))).toEqual([]);
    expect(checkTitle(prefix + "字".repeat(61))[0]).toContain("73 个字符");
  });

  it("不查英文大小写：主题全小写英文也通过", () => {
    expect(checkTitle("fix(core): lower case subject")).toEqual([]);
  });
});

describe("shouldSkipCommit", () => {
  it("跳过 fixup! 和 squash!", () => {
    expect(shouldSkipCommit("fixup! feat(core): 增加")).toBe(true);
    expect(shouldSkipCommit("squash! feat(core): 增加")).toBe(true);
    expect(shouldSkipCommit("feat(core): 增加")).toBe(false);
  });
});

describe("命令行", () => {
  it("合格标题退出码 0，不合格退出码 1，没参数退出码 2", () => {
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(run("--title", "feat(core): 增加运行状态机").status).toBe(0);
    expect(run("--title", "随便写写").status).toBe(1);
    expect(run().status).toBe(2);
  });

  it("--range 检查区间里的每个提交", () => {
    const result = spawnSync(process.execPath, [script, "--range", "HEAD..HEAD"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0); // 空区间没有可检查的提交
  });
});
