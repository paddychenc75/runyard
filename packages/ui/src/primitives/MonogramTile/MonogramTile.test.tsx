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
});
