import { describe, expect, it } from "vitest";
import { childEnv, RUN_MARKER_VAR } from "./child-env.ts";
import { expandCommand } from "./expand-command.ts";

describe("expandCommand", () => {
  it("[RUN-LIFECYCLE-26] 路径里的空格留在同一个参数里，不被拆开，也不经过 shell 解释", () => {
    const dir = "/Users/me/My Library/demo $(touch x)";
    const argv = expandCommand(["node", "{dir}/main.js", "--port", "{port}", "--name={name}"], {
      dir,
      port: 7100,
      name: "a b;c",
    });
    expect(argv).toEqual(["node", `${dir}/main.js`, "--port", "7100", "--name=a b;c"]);
  });

  it("没有值的占位符和别的花括号原样保留", () => {
    expect(expandCommand(["x", "{entry}", '{"a":1}'], { dir: "/d", name: "n" })).toEqual([
      "x",
      "{entry}",
      '{"a":1}',
    ]);
  });
});

describe("childEnv", () => {
  it("[RUN-LIFECYCLE-25] 去掉 ELECTRON_RUN_AS_NODE，保留别的变量，并放上运行标记", () => {
    const env = childEnv({ ELECTRON_RUN_AS_NODE: "1", PATH: "/bin" }, "run-9");
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env[RUN_MARKER_VAR]).toBe("run-9");
  });
});
