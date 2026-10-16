import { describe, expect, it } from "vitest";
import { makeRepo } from "./test-helpers.ts";
import {
  checkBaselines,
  declaresVariantOrState,
  MAX_BASELINE_BYTES,
  uiFixtures,
} from "./ui-fixtures.ts";

const FIXTURE = `export const meta = { name: "Button", layer: "primitive", boards: [] };\nexport const samples = [];\n`;
const component = (layer: string, name: string, extra: Record<string, string> = {}) => ({
  [`packages/ui/src/${layer}/${name}/${name}.tsx`]: `export const ${name} = 1;\n`,
  [`packages/ui/src/${layer}/${name}/${name}.fixture.tsx`]: FIXTURE,
  ...extra,
});
const PNG = "packages/ui/visual/__screenshots__";

describe("ui-fixtures：样例文件", () => {
  it("每个组件文件夹都有样例文件，且导出 meta 和 samples：通过", () => {
    expect(
      uiFixtures.run(
        makeRepo({ ...component("primitives", "Button"), ...component("patterns", "DataTable") }),
      ),
    ).toEqual([]);
  });

  it("组件没有样例文件时报错，指出文件夹、缺的文件名和手册", () => {
    const root = makeRepo({
      "packages/ui/src/primitives/Switch/Switch.tsx": "export const Switch = 1;\n",
      "packages/ui/src/primitives/Switch/index.ts": "export {};\n",
    });
    const errors = uiFixtures.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/ui/src/primitives/Switch");
    expect(errors[0]).toContain("Switch.fixture.tsx");
    expect(errors[0]).toContain("docs/guides/add-ui-component.md");
  });

  it("样例文件缺 meta 或 samples 时报错", () => {
    const root = makeRepo({
      ...component("primitives", "Button"),
      "packages/ui/src/primitives/Button/Button.fixture.tsx": "export const samples = [];\n",
    });
    expect(uiFixtures.run(root).join("\n")).toContain("没有导出 meta");
    const both = makeRepo({
      ...component("primitives", "Button"),
      "packages/ui/src/primitives/Button/Button.fixture.tsx": "export const x = 1;\n",
    });
    expect(uiFixtures.run(both).join("\n")).toContain("meta 和 samples");
  });

  it("功能模块里带 variant 或 state 属性的组件要有样例文件；没有这类属性的不要求", () => {
    expect(declaresVariantOrState("interface P { variant: 'a' | 'b' }")).toBe(true);
    expect(declaresVariantOrState("type P = { state?: string }")).toBe(true);
    expect(declaresVariantOrState("interface P { label: string }")).toBe(false);
    const dir = "apps/desktop/src/renderer/features/library/components";
    const root = makeRepo({
      [`${dir}/Row.tsx`]: "interface P { variant: 'a' }\nexport const Row = 1;\n",
      [`${dir}/Plain.tsx`]: "interface P { label: string }\nexport const Plain = 1;\n",
    });
    const errors = uiFixtures.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Row.tsx");
    expect(errors[0]).toContain("Row.fixture.tsx");
  });
});

describe("ui-fixtures：基准图", () => {
  const png = (bytes: number) => "x".repeat(bytes);

  it("有基准图而没有样例：报错", () => {
    const root = makeRepo({
      ...component("primitives", "Button"),
      [`${PNG}/Button-light-zh-CN.png`]: png(10),
      [`${PNG}/Ghost-light-zh-CN.png`]: png(10),
    });
    const errors = uiFixtures.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Ghost-light-zh-CN.png");
    expect(errors[0]).toContain("没有样例文件");
  });

  it("基准图目录建立之后，有样例而没有基准图：报错；目录还没有时不查", () => {
    const withDir = makeRepo({
      ...component("primitives", "Button"),
      ...component("primitives", "Icon"),
      [`${PNG}/Button-light-zh-CN.png`]: png(10),
    });
    const errors = uiFixtures.run(withDir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("组件 Icon 有样例文件却没有基准图");
    expect(errors[0]).toContain("update-ui-baseline");
    expect(uiFixtures.run(makeRepo(component("primitives", "Button")))).toEqual([]);
  });

  it("单张超过 200 KB、总量超过 30 MB 都报错", () => {
    const one = (bytes: number) => ({
      path: `${PNG}/Button-light-zh-CN.png`,
      component: "Button",
      bytes,
    });
    expect(checkBaselines(["Button"], [one(MAX_BASELINE_BYTES)], true)).toEqual([]);
    expect(checkBaselines(["Button"], [one(MAX_BASELINE_BYTES + 1)], true).join("")).toContain(
      "超过单张 200 KB",
    );
    const huge = Array.from({ length: 160 }, (_, i) => ({
      path: `${PNG}/Button-${i}.png`,
      component: "Button",
      bytes: MAX_BASELINE_BYTES,
    }));
    expect(checkBaselines(["Button"], huge, true).join("")).toContain("基准图总量");
  });
});
