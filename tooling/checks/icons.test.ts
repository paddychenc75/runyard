import { describe, expect, it } from "vitest";
import { ICON_TABLE, parseIconSource, renderIconTable } from "../../packages/ui/build/icons.ts";
import { icons } from "./icons.ts";
import { makeRepo } from "./test-helpers.ts";

const GOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor"/></svg>`;
const table = (files: Record<string, string>) =>
  renderIconTable(Object.entries(files).map(([name, text]) => parseIconSource(name, text)));

function repo(svgs: Record<string, string>, generated?: string) {
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(svgs)) {
    files[`packages/ui/src/icons/svg/${name}`] = text;
  }
  files[`packages/ui/${ICON_TABLE}`] = generated ?? table(svgs);
  return makeRepo(files);
}

describe("icons 检查", () => {
  it("合规的源文件加最新的图标表通过", () => {
    expect(icons.run(repo({ "plus.svg": GOOD_SVG }))).toEqual([]);
  });

  it("viewBox 不是 16 或 24 时报错，并指向手册", () => {
    const errors = icons.run(
      repo({ "plus.svg": GOOD_SVG.replace("0 0 16 16", "0 0 20 20") }, "// 任意内容"),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/ui/src/icons/svg/plus.svg");
    expect(errors[0]).toContain("viewBox");
    expect(errors[0]).toContain("docs/guides/add-ui-component.md");
  });

  it("写死颜色、内联样式、<path> 以外的元素都报错，各报一条", () => {
    const errors = icons.run(
      repo(
        {
          "red.svg": GOOD_SVG.replace("currentColor", "#ff0000"),
          "styled.svg": GOOD_SVG.replace("<path ", `<path style="fill:red" `),
          "circle.svg": GOOD_SVG.replace("<path", "<circle").replace(/d="[^"]*"/, ""),
        },
        "// 任意内容",
      ),
    );
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toContain("不许写具体颜色");
    expect(errors.join("\n")).toContain("内联样式");
    expect(errors.join("\n")).toContain("只许 <path>");
  });

  it("图标表过期（加了源文件没重新生成）或不存在时报错并给出命令", () => {
    const stale = table({ "plus.svg": GOOD_SVG });
    const errors = icons.run(repo({ "plus.svg": GOOD_SVG, "minus.svg": GOOD_SVG }, stale));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("pnpm icons:build");

    const root = makeRepo({ "packages/ui/src/icons/svg/plus.svg": GOOD_SVG });
    expect(icons.run(root)[0]).toContain("过期或不存在");
  });

  it("手改图标表也会被发现", () => {
    const good = table({ "plus.svg": GOOD_SVG });
    expect(icons.run(repo({ "plus.svg": GOOD_SVG }, `${good}// 手改\n`))).toHaveLength(1);
  });
});
