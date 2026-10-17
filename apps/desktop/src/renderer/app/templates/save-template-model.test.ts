import { templateIdPattern } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { buildPathTree } from "./path-tree.ts";
import {
  excludePaths,
  idProblem,
  initialId,
  saveRequestOf,
  slugOf,
} from "./save-template-model.ts";

describe("标识的行内校验", () => {
  it("[DESKTOP-TEMPLATES-VIEW-08] 已被占用的标识写明被占用；不合法的写明写法；空的不报错", () => {
    expect(idProblem("todo-api", ["todo-api", "react19"])).toBe("taken");
    expect(idProblem("Todo", [])).toBe("invalid");
    expect(idProblem("-todo", [])).toBe("invalid");
    expect(idProblem("todo-", [])).toBe("invalid");
    expect(idProblem("todo api", [])).toBe("invalid");
    expect(idProblem("", ["x"])).toBeNull();
    expect(idProblem("my-todo", ["todo-api"])).toBeNull();
  });

  it("界面里的写法规则和协议包的 templateIdPattern 是同一条", () => {
    for (const id of ["a", "a-b", "a1", "1a", "a--b", "-a", "a-", "A", "a_b", "", "a b"]) {
      expect(idProblem(id, []) === null).toBe(id === "" || templateIdPattern.test(id));
    }
  });

  it("初始标识：项目名转出来合法且空闲就用，否则留空", () => {
    expect(slugOf("Hono Todo API")).toBe("hono-todo-api");
    expect(initialId("hono-todo-api", [])).toBe("hono-todo-api");
    expect(initialId("hono-todo-api", ["hono-todo-api"])).toBe("");
    expect(initialId("待办接口", [])).toBe("");
  });
});

describe("文件树勾选转成保存请求", () => {
  const tree = buildPathTree(["src/index.ts", "src/util.ts", "package.json", "tsconfig.json"]);

  it("[DESKTOP-TEMPLATES-VIEW-10] 勾上的默认不包含项进 include，其余默认全留", () => {
    const request = saveRequestOf({
      playground: "p",
      id: "todo-api",
      name: "待办接口起步",
      description: "",
      replaceName: true,
      tree,
      unchecked: new Set(),
      included: new Set([".env"]),
    });
    expect(request).toEqual({
      playground: "p",
      id: "todo-api",
      name: "待办接口起步",
      description: "",
      replaceName: true,
      include: [".env"],
      exclude: [],
    });
  });

  it("去掉整个文件夹的勾只写文件夹；只去掉其中一个文件就写那个文件", () => {
    expect(excludePaths(tree, new Set(["src/index.ts", "src/util.ts"]))).toEqual(["src"]);
    expect(excludePaths(tree, new Set(["src/util.ts", "package.json"]))).toEqual([
      "src/util.ts",
      "package.json",
    ]);
  });
});
