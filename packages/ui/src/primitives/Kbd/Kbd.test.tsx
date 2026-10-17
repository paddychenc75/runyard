import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./Kbd.tsx";

describe("Kbd", () => {
  it("渲染成 kbd 元素，文字原样显示，ref 和 className 透传", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Kbd ref={ref} className="extra">
        esc
      </Kbd>,
    );
    const key = screen.getByText("esc");
    expect(key.tagName).toBe("KBD");
    expect(ref.current).toBe(key);
    expect(key.className).toContain("extra");
  });
});
