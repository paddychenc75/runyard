import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
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

// 用仓库真实的 layers.json 核对 @runyard/i18n 的位置（技术设计 §3.2）：
// 只有命令行（以后还有界面）能导入它；管理进程一侧的五个包不许，它自己只许导入 protocol
describe("layers 检查：@runyard/i18n 的规则", () => {
  const real = JSON.parse(
    readFileSync(join(import.meta.dirname, "layers.json"), "utf8"),
  ) as typeof rules;
  const pathOf = (name: string) => (real.packages as Record<string, { path: string }>)[name]?.path;

  // 造一个只有 from 和 to 两个包的仓库，from 声明并引用了 to
  function repoWhere(from: string, to: string): string {
    const fromPath = pathOf(from) as string;
    const toPath = pathOf(to) as string;
    return makeRepo({
      "tooling/checks/layers.json": real,
      "tsconfig.json": { references: [{ path: fromPath }, { path: toPath }] },
      [`${fromPath}/package.json`]: { name: from, dependencies: { [to]: "workspace:*" } },
      [`${fromPath}/tsconfig.json`]: {
        references: [{ path: posix.relative(fromPath, toPath) }],
      },
      [`${toPath}/package.json`]: { name: to },
      [`${toPath}/tsconfig.json`]: { references: [] },
    });
  }

  it.each([
    "@runyard/protocol",
    "@runyard/platform",
    "@runyard/core",
    "@runyard/supervisor",
    "@runyard/client",
  ])("拒绝 %s 导入 @runyard/i18n", (name) => {
    const errors = layers.run(repoWhere(name, "@runyard/i18n"));
    expect(errors.some((e) => e.includes(`不允许 ${name} 依赖它`))).toBe(true);
  });

  it("拒绝 @runyard/i18n 导入 protocol 以外的内部包", () => {
    const errors = layers.run(repoWhere("@runyard/i18n", "@runyard/core"));
    expect(errors.some((e) => e.includes("不允许 @runyard/i18n 依赖它"))).toBe(true);
  });

  it("命令行可以导入 @runyard/i18n，@runyard/i18n 可以导入 protocol", () => {
    expect(layers.run(repoWhere("runyard", "@runyard/i18n"))).toEqual([]);
    expect(layers.run(repoWhere("@runyard/i18n", "@runyard/protocol"))).toEqual([]);
  });
});
