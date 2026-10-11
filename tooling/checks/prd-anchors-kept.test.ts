import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAnchorsKept, prdAnchorsKept } from "./prd-anchors-kept.ts";
import { makeRepo } from "./test-helpers.ts";

const anchor = (id: string) => `<a id="${id}"></a>\n## 一节\n\n`;
const BASE = anchor("prd-run") + anchor("prd-ports");

describe("prd-anchors-kept 检查", () => {
  it("锚点都还在时通过；删掉没人引用的锚点也通过", () => {
    expect(checkAnchorsKept(BASE, BASE, { "a.md": "PRD #prd-run" })).toEqual([]);
    expect(checkAnchorsKept(BASE, anchor("prd-run"), { "a.md": "PRD #prd-run" })).toEqual([]);
  });

  it("删掉了还被引用着的锚点", () => {
    const errors = checkAnchorsKept(BASE, anchor("prd-run"), {
      "docs/guides/x.md": "见 PRD #prd-ports。",
      "docs/guides/y.md": "见 PRD #prd-ports-range。",
    });
    expect(errors.join()).toContain("删掉（或改名）了锚点 prd-ports");
    expect(errors.join()).toContain("docs/guides/x.md");
    expect(errors.join()).not.toContain("docs/guides/y.md");
  });

  it("重复的锚点", () => {
    expect(checkAnchorsKept(undefined, BASE + anchor("prd-run"), {}).join()).toContain(
      "出现了不止一次",
    );
  });

  it("在真实的 git 仓库里：和最近一次提交比", () => {
    const root = makeRepo({ "docs/product/02-prd.md": BASE, "AGENTS.md": "PRD #prd-ports\n" });
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    expect(prdAnchorsKept.run(root)).toEqual([]);
    writeFileSync(join(root, "docs/product/02-prd.md"), anchor("prd-run"));
    expect(prdAnchorsKept.run(root).join()).toContain("锚点 prd-ports");
  });
});
