import { describe, expect, it } from "vitest";
import { docsCommands } from "./docs-commands.ts";
import { makeRepo } from "./test-helpers.ts";

const PKG = { name: "root", scripts: { check: "x", test: "x" } };
const TABLE = "`pnpm check` `pnpm test`\n";

describe("docs-commands 检查", () => {
  it("脚本、pnpm 自带命令、存在的 node 脚本都通过", () => {
    const root = makeRepo({
      "package.json": PKG,
      "docs/guides/commands.md": TABLE,
      "AGENTS.md":
        "```sh\npnpm install\npnpm test --filter x\nnode tooling/run.ts\n```\n`pnpm run check`\n",
      "tooling/run.ts": "",
    });
    expect(docsCommands.run(root)).toEqual([]);
  });

  it("写到不存在的 pnpm 脚本", () => {
    const root = makeRepo({
      "package.json": PKG,
      "docs/guides/commands.md": TABLE,
      "AGENTS.md": "运行 `pnpm test:template html`。\n",
    });
    expect(docsCommands.run(root).join()).toContain("pnpm test:template 不存在");
  });

  it("node 后面的脚本文件不存在", () => {
    const root = makeRepo({
      "package.json": PKG,
      "docs/guides/commands.md": TABLE,
      "AGENTS.md": "`node tooling/gone.ts`\n",
      "tooling/run.ts": "",
    });
    expect(docsCommands.run(root).join()).toContain("node tooling/gone.ts 里的文件不存在");
  });

  it("根脚本没写进命令表", () => {
    const root = makeRepo({ "package.json": PKG, "docs/guides/commands.md": "`pnpm check`\n" });
    expect(docsCommands.run(root).join()).toContain("脚本 test 没有写进");
  });
});
