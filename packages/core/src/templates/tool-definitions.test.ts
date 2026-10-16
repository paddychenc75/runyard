import { describe, expect, it } from "vitest";
import { parseToolDefinitions } from "./tool-definitions.ts";

const base = {
  formatVersion: 1,
  id: "node",
  supported: ">=22 <27",
  detect: { args: ["--version"], pattern: "v(\\d+\\.\\d+\\.\\d+)" },
  install: { darwin: { url: "https://example.com/node" } },
};
const src = (file: string, value: unknown) => ({ file, text: JSON.stringify(value) });

describe("parseToolDefinitions", () => {
  it("合格的定义进 definitions，可直接交给工具链服务", () => {
    const set = parseToolDefinitions([src("node.json", base)]);
    expect(set.problems).toEqual([]);
    expect(set.definitions.get("node")?.supported).toBe(">=22 <27");
  });

  it("坏的一份只让自己不可用，其余照常", () => {
    const set = parseToolDefinitions([
      src("node.json", base),
      { file: "bad.json", text: "{" },
      src("go.json", { ...base, id: "go", formatVersion: 2 }),
      src("x.json", base),
      src("pnpm.json", { ...base, id: "pnpm", detect: { args: ["--version"], pattern: "(" } }),
      src("uv.json", { ...base, id: "uv", supported: "latest" }),
    ]);
    expect([...set.definitions.keys()]).toEqual(["node"]);
    expect(set.problems.map((p) => [p.file, p.kind])).toEqual([
      ["bad.json", "invalid"],
      ["go.json", "newer"],
      ["x.json", "id-mismatch"],
      ["pnpm.json", "pattern-invalid"],
      ["uv.json", "supported-invalid"],
    ]);
  });
});
