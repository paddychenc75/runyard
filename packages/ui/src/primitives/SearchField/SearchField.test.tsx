import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField.tsx";

const label = "search it" as Localized;

describe("SearchField", () => {
  it("名字就是 label，Tab 能到达，输入触发 onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchField label={label} onChange={onChange} />);
    await user.tab();
    const input = screen.getByRole("textbox", { name: "search it" });
    expect(document.activeElement).toBe(input);
    await user.keyboard("ab");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ref 指向输入框，末端提示显示出来，放大镜对读屏器隐藏", () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(<SearchField ref={ref} label={label} trailing={<kbd>esc</kbd>} />);
    expect(ref.current).toBe(screen.getByRole("textbox"));
    expect(screen.getByText("esc")).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("没有 label 是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #172 label 必填
      <SearchField />
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});
