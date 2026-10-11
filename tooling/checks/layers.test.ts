import { describe, expect, it } from "vitest";
import { layers } from "./layers.ts";
import { makeRepo } from "./test-helpers.ts";

const rules = {
  packages: {
    "@runyard/protocol": { path: "packages/protocol", allow: [] },
    "@runyard/platform": { path: "packages/platform", allow: ["@runyard/protocol"] },
    "@runyard/testing": {
      path: "packages/testing",
      allow: ["@runyard/protocol", "@runyard/core"],
      devOnly: ["@runyard/core"],
    },
    "@runyard/core": { path: "packages/core", allow: ["@runyard/protocol"] },
  },
};

// 合法布局：platform 依赖 protocol，两边都有声明和 reference
function goodRepo(overrides: Record<string, string | object> = {}): string {
  return makeRepo({
    "tooling/checks/layers.json": rules,
    "tsconfig.json": {
      references: [{ path: "packages/protocol" }, { path: "packages/platform" }],
    },
    "packages/protocol/package.json": { name: "@runyard/protocol" },
    "packages/protocol/tsconfig.json": { references: [] },
    "packages/platform/package.json": {
      name: "@runyard/platform",
      dependencies: { "@runyard/protocol": "workspace:*" },
    },
    "packages/platform/tsconfig.json": { references: [{ path: "../protocol" }] },
    ...overrides,
  });
}

describe("layers 检查", () => {
  it("合法布局通过", () => {
    expect(layers.run(goodRepo())).toEqual([]);
  });

  it("拒绝 layers.json 不允许的依赖声明", () => {
    const root = goodRepo({
      "packages/protocol/package.json": {
        name: "@runyard/protocol",
        dependencies: { "@runyard/platform": "workspace:*" },
      },
    });
    const errors = layers.run(root);
    expect(errors.some((e) => e.includes("不允许 @runyard/protocol 依赖它"))).toBe(true);
  });

  it("拒绝 tsconfig 里越界的 reference", () => {
    const root = goodRepo({
      "packages/protocol/tsconfig.json": { references: [{ path: "../platform" }] },
    });
    expect(layers.run(root).some((e) => e.includes("tsconfig.json 引用了 @runyard/platform"))).toBe(
      true,
    );
  });

  it("package.json 声明了依赖但 tsconfig 没有 reference 时报错", () => {
    const root = goodRepo({ "packages/platform/tsconfig.json": { references: [] } });
    expect(layers.run(root).some((e) => e.includes("缺少对 @runyard/protocol 的 reference"))).toBe(
      true,
    );
  });

  it("拒绝没有登记的包", () => {
    const root = goodRepo({ "packages/rogue/package.json": { name: "@runyard/rogue" } });
    expect(layers.run(root).some((e) => e.includes("packages/rogue 不在"))).toBe(true);
  });

  it("devOnly 的依赖写进 dependencies 时报错", () => {
    const root = goodRepo({
      "tsconfig.json": {
        references: [
          { path: "packages/protocol" },
          { path: "packages/platform" },
          { path: "packages/testing" },
        ],
      },
      "packages/core/package.json": { name: "@runyard/core" },
      "packages/testing/package.json": {
        name: "@runyard/testing",
        dependencies: { "@runyard/core": "workspace:*" },
      },
      "packages/testing/tsconfig.json": { references: [{ path: "../core" }] },
    });
    expect(layers.run(root).some((e) => e.includes("只能是 devDependencies"))).toBe(true);
  });

  it("根 tsconfig 漏掉某个包时报错", () => {
    const root = goodRepo({ "tsconfig.json": { references: [{ path: "packages/protocol" }] } });
    expect(
      layers
        .run(root)
        .some((e) => e.includes("根 tsconfig.json 的 references 里没有 packages/platform")),
    ).toBe(true);
  });
});
