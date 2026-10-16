// @vitest-environment jsdom
import type { Localized } from "@runyard/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogView, type LogViewLine } from "./LogView.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const label = "日志" as Localized;
const make = (count: number): LogViewLine[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, text: `line ${index + 1}` }));
const rows = (container: HTMLElement) => container.querySelectorAll("[data-tone]").length;

describe("LogView", () => {
  it("按顺序显示每一行，带时间和语气，文字原样且标为用户内容", () => {
    render(
      <LogView
        label={label}
        lines={[
          { id: 1, time: "20:02:10", tone: "command", text: "node a.ts" },
          { id: 2, tone: "error", text: "boom <b>" },
        ]}
      />,
    );
    expect(screen.getByRole("log", { name: "日志" }).textContent).toBe("20:02:10node a.tsboom <b>");
    const command = screen.getByText("node a.ts");
    expect(command.hasAttribute("data-user-content")).toBe(true);
    expect(command.closest("[data-tone]")?.getAttribute("data-tone")).toBe("command");
    expect(screen.getByText("boom <b>").closest("[data-tone]")?.getAttribute("data-tone")).toBe(
      "error",
    );
  });

  it("没有行时显示说明", () => {
    render(<LogView label={label} lines={[]} empty={"还没有输出" as Localized} />);
    expect(screen.getByText("还没有输出")).toBeTruthy();
  });

  it("没有版面信息时最多画最后 200 行，不一次画出全部", () => {
    const { container } = render(<LogView label={label} lines={make(1000)} />);
    expect(screen.queryByText("line 1000")).toBeTruthy();
    expect(screen.queryByText("line 1")).toBeNull();
    expect(rows(container)).toBe(200);
  });

  it("量出行高后只画视口内加余量的行（虚拟滚动）", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      height: 20,
    } as DOMRect);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    const { container } = render(<LogView label={label} lines={make(1000)} />);
    expect(rows(container)).toBeLessThan(40);
    expect(container.querySelector("[data-virtual]")).not.toBeNull();
  });

  it("新行到来时画出新行", () => {
    const { rerender } = render(<LogView label={label} lines={make(3)} />);
    rerender(<LogView label={label} lines={make(4)} />);
    expect(screen.getByText("line 4")).toBeTruthy();
  });
});
