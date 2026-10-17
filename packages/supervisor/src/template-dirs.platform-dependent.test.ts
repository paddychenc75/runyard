import { describe, expect, it } from "vitest";
import { templateDirsUnder } from "./template-dirs.ts";

describe("templateDirsUnder", () => {
  it("内置模板、运行器、工具定义都取自同一个根下的同名子目录", () => {
    const dirs = templateDirsUnder(new URL("file:///app/Resources/runyard/templates/"));
    expect(dirs).toEqual({
      builtinDir: "/app/Resources/runyard/templates/builtin",
      runnersDir: "/app/Resources/runyard/templates/runners",
      toolsDir: "/app/Resources/runyard/templates/tools",
    });
  });
});
