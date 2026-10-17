import { describe, expect, it } from "vitest";
import { buildPathTree, filesUnder } from "./path-tree.ts";

describe("buildPathTree", () => {
  it("文件夹排在前面，同类按名字排；路径是正斜杠", () => {
    const tree = buildPathTree(["package.json", "src/main.tsx", "src/App.tsx", "index.html"]);
    expect(tree.map((node) => [node.name, node.directory])).toEqual([
      ["src", true],
      ["index.html", false],
      ["package.json", false],
    ]);
    expect(tree[0]?.children.map((node) => node.path)).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(filesUnder(tree[0] as never)).toEqual(["src/App.tsx", "src/main.tsx"]);
  });
});
