import { describe, expect, it } from "vitest";
import { rangeParts, shortenPath, toolName } from "./tool-view.ts";

describe("运行环境表的写法", () => {
  it("工具显示名是专有名词，不认识的原样显示", () => {
    expect(toolName("node")).toBe("Node");
    expect(toolName("pnpm")).toBe("pnpm");
    expect(toolName("ruby")).toBe("ruby");
  });

  it("版本范围拆成符号加版本号", () => {
    expect(rangeParts(">=1.22 <2")).toEqual([
      { operator: "≥", version: "1.22" },
      { operator: "<", version: "2" },
    ]);
    expect(rangeParts("*")).toEqual([]);
    expect(rangeParts("3.12")).toEqual([{ operator: "=", version: "3.12" }]);
  });

  it("主目录写成 ~，长路径中间省略，短路径不动", () => {
    expect(shortenPath("/Users/me/.nvm/versions/node/v25.6.0/bin/node")).toBe(
      "~/.nvm/…/v25.6.0/bin/node",
    );
    expect(shortenPath("/Users/me/.local/bin/python3")).toBe("~/.local/bin/python3");
    expect(shortenPath("/usr/local/bin/node")).toBe("/usr/local/bin/node");
  });
});
