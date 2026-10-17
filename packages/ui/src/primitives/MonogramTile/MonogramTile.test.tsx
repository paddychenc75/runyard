import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonogramTile } from "./MonogramTile.tsx";

describe("MonogramTile", () => {
  it("显示缩写，并对读屏器隐藏（旁边总有完整的名字）", () => {
    const { container } = render(<MonogramTile letters="Re" />);
    const tile = container.firstElementChild;
    expect(tile?.textContent).toBe("Re");
    expect(tile?.getAttribute("aria-hidden")).toBe("true");
  });

  it("有技术标志时画标志、不画缩写，且仍对读屏器隐藏", () => {
    const { container } = render(<MonogramTile letters="Vu" logo="vue" />);
    const tile = container.firstElementChild;
    expect(tile?.getAttribute("aria-hidden")).toBe("true");
    expect(tile?.textContent).toBe("");
    expect(tile?.getAttribute("data-logo")).toBe("vue");
    expect(tile?.querySelector("svg[data-icon='logo-vue'] path")).not.toBeNull();
  });

  it("没有标志时仍显示缩写，不带 svg", () => {
    const { container } = render(<MonogramTile letters="Go" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.firstElementChild?.textContent).toBe("Go");
  });

  it("没有标志的内置模板，字母带代表色标记；Python 用双色原图（两条路径）", () => {
    const { container } = render(
      <>
        <MonogramTile letters="Re" brand="react" />
        <MonogramTile letters="Py" logo="python" />
      </>,
    );
    expect(container.querySelector("[data-brand='react']")?.textContent).toBe("Re");
    expect(container.querySelectorAll("svg[data-icon='logo-python'] path")).toHaveLength(2);
  });
});
