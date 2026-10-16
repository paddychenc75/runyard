import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  affectedTemplates,
  buildMatrix,
  lowerBound,
  readTemplates,
  type TemplateInfo,
  type Toolchains,
} from "./template-matrix.ts";

const toolchains: Toolchains = {
  upper: { node: "24.x", pnpm: "", python: "3.x", go: "stable" },
  os: ["ubuntu-latest", "macos-26"],
};

const hono: TemplateInfo = {
  id: "hono",
  kind: "server",
  requires: { node: { version: ">=22.18<27" }, pnpm: { version: ">=10.34.6<12" } },
};
const python: TemplateInfo = {
  id: "python",
  kind: "script",
  requires: { python: { version: ">=3.12<4" } },
};
const html: TemplateInfo = { id: "html", kind: "static", requires: {} };

describe("模板 CI 矩阵", () => {
  it("下限取声明范围的下界并补成 X.Y.0", () => {
    expect(lowerBound(">=22.18<27")).toBe("22.18.0");
    expect(lowerBound(">=1.26<2")).toBe("1.26.0");
    expect(lowerBound(">=10.34.6<12")).toBe("10.34.6");
    expect(lowerBound("<2")).toBeUndefined();
  });

  it("每晚：每个模板在两个系统上各跑上限和下限；工具不需要的留空", () => {
    const { include } = buildMatrix({
      templates: [hono, python, html],
      toolchains,
      mode: "nightly",
    });
    expect(include).toHaveLength(3 * 2 * 2);
    expect(
      include.find((e) => e.template === "python" && e.bound === "lower" && e.os === "macos-26"),
    ).toMatchObject({ python: "3.12.0", node: "", go: "", pnpm: "" });
    expect(include.find((e) => e.template === "hono" && e.bound === "lower")).toMatchObject({
      node: "22.18.0",
      pnpm: "10.34.6",
    });
    expect(include.find((e) => e.template === "hono" && e.bound === "upper")).toMatchObject({
      node: "24.x",
      pnpm: "",
    });
    expect(include.find((e) => e.template === "html")).toMatchObject({ kind: "static" });
  });

  it("拉取请求只测改动的模板，且只用上限", () => {
    const only = affectedTemplates(["templates/builtin/hono/files/src/index.ts"]);
    expect(only).toEqual(new Set(["hono"]));
    const { include } = buildMatrix({
      templates: [hono, python, html],
      toolchains,
      mode: "pr",
      ...(only === null ? {} : { only }),
    });
    expect(include.map((e) => `${e.template}/${e.bound}/${e.os}`).sort()).toEqual([
      "hono/upper/macos-26",
      "hono/upper/ubuntu-latest",
    ]);
  });

  it("运行器、工具定义、冒烟脚本或本矩阵变了就测全部模板；无关文件不触发", () => {
    expect(affectedTemplates(["templates/runners/vite/runner.json"])).toBeNull();
    expect(affectedTemplates(["tooling/scripts/template-smoke.ts"])).toBeNull();
    expect(affectedTemplates([".github/workflows/template-smoke.yml"])).toBeNull();
    expect(affectedTemplates(["README.md", "packages/core/src/a.ts"])).toEqual(new Set());
  });

  it("新模板只要放进目录就进矩阵；不认识的工具直接报错并指向要改的数据", () => {
    const next16: TemplateInfo = { id: "next16", kind: "server", requires: hono.requires };
    const ids = buildMatrix({ templates: [hono, next16], toolchains, mode: "pr" }).include.map(
      (e) => e.template,
    );
    expect(ids).toContain("next16");
    const rust: TemplateInfo = { id: "rs", kind: "script", requires: { rust: { version: ">=1" } } };
    expect(() => buildMatrix({ templates: [rust], toolchains, mode: "pr" })).toThrow(
      /template-toolchains\.json/,
    );
  });

  it("仓库里现有的模板都能读出并进入每晚矩阵", () => {
    const root = join(import.meta.dirname, "..", "..");
    const templates = readTemplates(root);
    expect(templates.map((t) => t.id)).toEqual(
      expect.arrayContaining(["html", "react19", "node-ts", "python", "go", "hono"]),
    );
    const { include } = buildMatrix({ templates, toolchains, mode: "nightly" });
    expect(new Set(include.map((e) => e.template))).toEqual(new Set(templates.map((t) => t.id)));
  });
});
