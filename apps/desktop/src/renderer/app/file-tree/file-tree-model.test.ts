import { describe, expect, it } from "vitest";
import type { FileEntry } from "../../../shared/editor-files.ts";
import {
  createParentFor,
  foldersToReload,
  navigate,
  remapPrefix,
  visibleRows,
} from "./file-tree-model.ts";

const entry = (path: string, kind: "file" | "folder"): FileEntry => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  kind,
  symlink: false,
});

const dirs = new Map<string, FileEntry[]>([
  ["", [entry("src", "folder"), entry("a.txt", "file")]],
  ["src", [entry("src/x.ts", "file")]],
]);

describe("文件树的行", () => {
  it("只摊开展开了的文件夹；没读回来的展开夹标为读取中", () => {
    const rows = visibleRows({ dirs, expanded: new Set(["src"]) }, null);
    expect(rows.map((r) => r.type === "entry" && r.entry.path)).toEqual([
      "src",
      "src/x.ts",
      "a.txt",
    ]);
    const loading = visibleRows(
      { dirs: new Map([["", [entry("src", "folder")]]]), expanded: new Set(["src"]) },
      null,
    );
    expect(loading[0]?.type === "entry" && loading[0].loading).toBe(true);
  });

  it("新建的输入行排在目标文件夹的第一位；改名的输入行替换原来的那一行", () => {
    const create = visibleRows(
      { dirs, expanded: new Set(["src"]) },
      { mode: "create", kind: "file", parent: "src" },
    );
    expect(create.map((r) => r.type)).toEqual(["entry", "draft", "entry", "entry"]);
    const rename = visibleRows({ dirs, expanded: new Set() }, { mode: "rename", path: "a.txt" });
    expect(rename.map((r) => r.type)).toEqual(["entry", "draft"]);
  });
});

describe("方向键", () => {
  const rows = visibleRows({ dirs, expanded: new Set(["src"]) }, null);
  it("右键：收着的文件夹展开，展开的进入第一个子项；左键：展开的收起，否则回父文件夹", () => {
    expect(navigate(visibleRows({ dirs, expanded: new Set() }, null), "src", "ArrowRight")).toEqual(
      {
        type: "expand",
        path: "src",
      },
    );
    expect(navigate(rows, "src", "ArrowRight")).toEqual({ type: "focus", path: "src/x.ts" });
    expect(navigate(rows, "src", "ArrowLeft")).toEqual({ type: "collapse", path: "src" });
    expect(navigate(rows, "src/x.ts", "ArrowLeft")).toEqual({ type: "focus", path: "src" });
    expect(navigate(rows, "a.txt", "ArrowLeft")).toEqual({ type: "none" });
  });
  it("上下到头不越界，Home 和 End 到头尾", () => {
    expect(navigate(rows, "src", "ArrowUp")).toEqual({ type: "focus", path: "src" });
    expect(navigate(rows, "a.txt", "ArrowDown")).toEqual({ type: "focus", path: "a.txt" });
    expect(navigate(rows, "a.txt", "Home")).toEqual({ type: "focus", path: "src" });
    expect(navigate(rows, "src", "End")).toEqual({ type: "focus", path: "a.txt" });
  });
});

describe("磁盘变化与改名", () => {
  it("只重读已读过的文件夹：变化路径的父文件夹，和被换掉的文件夹自己", () => {
    const loaded = new Set(["", "src"]);
    expect(
      foldersToReload(
        [
          { kind: "add", path: "src/new.ts", self: false },
          { kind: "remove", path: "src/old.ts", self: false },
          { kind: "add", path: "other/deep.ts", self: false },
          { kind: "remove", path: "src", self: false },
        ],
        loaded,
      ).sort(),
    ).toEqual(["", "src"]);
  });

  it("文件夹改名：展开集合里它和它下面的路径换成新前缀，不碰名字相近的别的路径", () => {
    const next = remapPrefix(new Set(["src", "src/components", "srcs", "lib"]), "src", "ui");
    expect([...next].sort()).toEqual(["lib", "srcs", "ui", "ui/components"]);
  });

  it("新建放哪：选中文件夹放进去，选中文件放它旁边，没选放项目根", () => {
    expect(createParentFor(entry("src", "folder"))).toBe("src");
    expect(createParentFor(entry("src/x.ts", "file"))).toBe("src");
    expect(createParentFor(null)).toBe("");
  });
});
