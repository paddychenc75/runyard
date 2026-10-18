import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { type GlassMaterial, GlassSurface } from "./GlassSurface.tsx";

describe("GlassSurface", () => {
  const materials: GlassMaterial[] = ["toolbar", "sidebar", "filetree", "dialog", "menu", "toast"];

  it.each(materials)(
    "%s 材质写成 data-glass-material，样式由 materials.css 按它选取",
    (material) => {
      render(<GlassSurface material={material} data-testid="surface" />);
      expect(screen.getByTestId("surface").getAttribute("data-glass-material")).toBe(material);
    },
  );

  it("渲染子内容，className、ref 和原生属性透传到最外层元素", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <GlassSurface material="menu" ref={ref} className="extra" role="menu" aria-label="x">
        <span>inner</span>
      </GlassSurface>,
    );
    const surface = screen.getByRole("menu");
    expect(ref.current).toBe(surface);
    expect(surface.className).toContain("extra");
    expect(surface.textContent).toBe("inner");
  });

  it("不带 material 是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #163 material 必填，验证类型拦得住漏写
      <GlassSurface />
    );
    expect(typeOnly).toBeTypeOf("function");
  });

  it("[#392] 浮层材质不叠轮廓：材质表没有 border，阴影里没有顶边高光", () => {
    const css = readFileSync("src/styles/materials.css", "utf8");
    expect(css).not.toMatch(/^\s*border\s*:/m);
    const tokens = readFileSync("../tokens/generated/tokens.css", "utf8");
    expect(tokens).not.toMatch(/--shadow-(dialog|overlay|floating):[^;]*inset/);
    expect(tokens).not.toContain("--glass-border");
  });
});
