import { createTestTranslator } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon.tsx";

const { t } = createTestTranslator();

describe("Icon", () => {
  it("没有 label 的图标是装饰，读屏器跳过", () => {
    const { container } = render(<Icon name="plus" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("有 label 的图标是有名字的图片", () => {
    render(<Icon name="check" label={t("format.relative.justNow")} />);
    expect(screen.getByRole("img", { name: "⟦format.relative.justNow⟧" })).toBeTruthy();
  });

  it("默认 16 见方，size 可以改，viewBox 来自图标源文件", () => {
    const { container, rerender } = render(<Icon name="plus" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");
    rerender(<Icon name="plus" size={24} />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("按名字画出对应的路径，className 和原生属性透传到最外层", () => {
    const { container } = render(<Icon name="plus" className="extra" data-testid="icon" />);
    const svg = screen.getByTestId("icon");
    expect(svg.getAttribute("class")).toContain("extra");
    expect(svg.getAttribute("data-icon")).toBe("plus");
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("名字写错是类型错误", () => {
    // 只做类型检查，不渲染
    const typeOnly = () => (
      // @ts-expect-error #163 故意传不存在的图标名，验证 IconName 类型拦得住
      <Icon name="no-such-icon" />
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});
