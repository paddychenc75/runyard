import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtures } from "./registry.ts";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../src");

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? fixtureFiles(join(dir, entry.name))
      : entry.name.endsWith(".fixture.tsx")
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("工作台的样例登记", () => {
  it("每个 *.fixture.tsx 都登记在 registry.ts 里，组件名和文件夹名一致", () => {
    const registered = new Set(fixtures.map((fixture) => fixture.meta.name));
    const onDisk = fixtureFiles(srcDir).map((file) => {
      const name = /([^/\\]+)\.fixture\.tsx$/.exec(relative(srcDir, file))?.[1];
      return name ?? "";
    });
    expect([...registered].sort()).toEqual(onDisk.sort());
  });

  it("每个样例有唯一的名字，每个组件至少有一个“文字很长”之外的样例", () => {
    for (const { meta, samples } of fixtures) {
      const names = samples.map((sample) => sample.name);
      expect(new Set(names).size, `${meta.name} 的样例名重复`).toBe(names.length);
      expect(
        names.some((name) => name !== "long-label"),
        meta.name,
      ).toBe(true);
    }
  });

  it("三个组件各自覆盖了设计稿里画出的状态", () => {
    const names = (component: string) =>
      fixtures.find((fixture) => fixture.meta.name === component)?.samples.map((s) => s.name) ?? [];
    expect(names("Button")).toEqual(
      expect.arrayContaining([
        "primary-states",
        "glass-states",
        "neutral-states",
        "destructive-states",
        "with-icon",
        "loading",
        "sizes",
        "long-label",
      ]),
    );
    expect(names("GlassSurface")).toEqual(
      expect.arrayContaining(["toolbar", "sidebar", "filetree", "dialog", "menu", "long-label"]),
    );
    expect(names("Icon")).toEqual(expect.arrayContaining(["all-icons", "sizes", "with-label"]));
  });
});
