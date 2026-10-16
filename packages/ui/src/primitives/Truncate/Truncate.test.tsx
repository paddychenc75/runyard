import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Truncate } from "./Truncate.tsx";

describe("Truncate", () => {
  it("原样显示内容，并把 className 接在后面", () => {
    render(<Truncate className="extra">hello</Truncate>);
    const node = screen.getByText("hello");
    expect(node.className).toContain("extra");
  });
});
