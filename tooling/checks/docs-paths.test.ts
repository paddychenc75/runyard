import { describe, expect, it } from "vitest";
import { docsPaths, pathToCheck } from "./docs-paths.ts";
import { makeRepo } from "./test-helpers.ts";

const roots = new Set(["docs", "tooling", "packages"]);

describe("docs-paths 检查", () => {
  it("只把以仓库顶层名字开头、带斜杠的行内代码当作路径", () => {
    expect(pathToCheck("tooling/checks/run.ts", roots)).toBe("tooling/checks/run.ts");
    expect(pathToCheck("docs/guides/", roots)).toBe("docs/guides");
    expect(pathToCheck("~/.claude/CLAUDE.md", roots)).toBeUndefined();
    expect(pathToCheck("package.json", roots)).toBeUndefined();
    expect(pathToCheck("pnpm test --filter x", roots)).toBeUndefined();
  });

  it("带占位符的路径只核对占位符之前的目录", () => {
    expect(pathToCheck("docs/decisions/NNNN-title.md", roots)).toBe("docs/decisions");
    expect(pathToCheck("packages/<包名>/src", roots)).toBe("packages");
    expect(pathToCheck("docs/design/*.dc.html", roots)).toBe("docs/design");
  });

  it("写到的路径都存在时通过", () => {
    const root = makeRepo({
      "AGENTS.md": "看 `tooling/checks/run.ts` 和 `docs/guides/`。\n",
      "tooling/checks/run.ts": "",
      "docs/guides/a.md": "",
    });
    expect(docsPaths.run(root)).toEqual([]);
  });

  it("写到不存在的路径", () => {
    const root = makeRepo({ "AGENTS.md": "看 `packages/core/src/runner`。\n" });
    expect(docsPaths.run(root).join()).toContain("AGENTS.md:1 写到的路径 packages/core/src/runner");
  });

  it("决策记录不查", () => {
    const root = makeRepo({ "docs/architecture/decisions/0001-x.md": "`packages/gone/`\n" });
    expect(docsPaths.run(root)).toEqual([]);
  });
});
