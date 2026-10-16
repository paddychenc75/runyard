import { describe, expect, it } from "vitest";
import { loadTokens, type TokensSource, validateTokens } from "./model.ts";

const source = (): TokensSource => structuredClone(loadTokens(`${import.meta.dirname}/..`));

describe("tokens.json 校验", () => {
  it("仓库里的 tokens.json 没有问题", () => {
    expect(validateTokens(source())).toEqual([]);
  });

  it("写成范围的值（设计稿里“0.06 到 0.08”那种）被拒绝", () => {
    const tokens = source();
    const token = tokens.themed[0]?.tokens[0];
    if (token === undefined) throw new Error("fixture");
    token.light = "rgba(0, 0, 0, 0.06 到 0.08)";
    expect(validateTokens(tokens).join()).toContain("不是单个颜色");
  });

  it("引用了不存在的基础变量", () => {
    const tokens = source();
    const token = tokens.themed[0]?.tokens[0];
    if (token === undefined) throw new Error("fixture");
    token.dark = "{no-such-color}";
    expect(validateTokens(tokens).join()).toContain(token.name);
  });

  it("变量名重复", () => {
    const tokens = source();
    const first = tokens.themed[0]?.tokens[0];
    if (first === undefined) throw new Error("fixture");
    tokens.themed[1]?.tokens.push({ ...first });
    expect(validateTokens(tokens).join()).toContain("重复");
  });

  it("语义级变量的前缀不在清单里", () => {
    const tokens = source();
    tokens.scales[0]?.tokens.push({ name: "zoom-level", role: "x", value: 1 });
    expect(validateTokens(tokens).join()).toContain("前缀");
  });

  it("基础级变量不许用语义级前缀", () => {
    const tokens = source();
    tokens.base["color-blue"] = "#0000FF";
    expect(validateTokens(tokens).join()).toContain("基础级不带这些前缀");
  });
});
