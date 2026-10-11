import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate } from "../scripts/generate.ts";
import { generatedFresh } from "./generated-fresh.ts";
import { makeRepo } from "./test-helpers.ts";

const BEGIN = "<!-- generated:layers 开始（由 pnpm generate 生成，不要手改） -->";
const END = "<!-- generated:layers 结束 -->";
const LAYERS = {
  packages: {
    "@runyard/protocol": { path: "packages/protocol", allow: [] },
    "@runyard/core": { path: "packages/core", allow: ["@runyard/protocol"] },
  },
};

function repo(agents: string): string {
  return makeRepo({
    "AGENTS.md": agents,
    "tooling/checks/layers.json": LAYERS,
    "packages/protocol/package.json": { name: "@runyard/protocol" },
  });
}

describe("generated-fresh 检查", () => {
  it("生成一次之后通过，表里写明每个包建了没有", () => {
    const root = repo(`# x\n\n${BEGIN}\n${END}\n\n后文\n`);
    expect(generatedFresh.run(root).join()).toContain("生成内容过期了");
    for (const file of generate(root)) writeFileSync(join(root, file.path), file.content);
    expect(generatedFresh.run(root)).toEqual([]);
    const text = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(text).toContain("| `@runyard/protocol` | 无 | 已有 |");
    expect(text).toContain("| `@runyard/core` | `@runyard/protocol` | 还没建 |");
    expect(text).toContain("后文");
  });

  it("手改了生成的表", () => {
    const root = repo(`${BEGIN}\n| 包 | 可以导入 | 现状 |\n| 手改 | 的 | 行 |\n${END}\n`);
    expect(generatedFresh.run(root).join()).toContain("运行 pnpm generate");
  });

  it("生成标记被删掉", () => {
    expect(generatedFresh.run(repo("# 没有标记\n")).join()).toContain("找不到生成标记");
  });
});
