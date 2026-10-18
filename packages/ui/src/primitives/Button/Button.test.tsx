import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.tsx";

describe("Button", () => {
  it("Tab 能到达，Enter 和空格都能触发点击", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>go</Button>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "go" }));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("禁用的按钮 Tab 跳过，点击不触发", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Button disabled onClick={onClick}>
          off
        </Button>
        <Button>next</Button>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "next" }));
    await user.click(screen.getByRole("button", { name: "off" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("进行中的按钮仍可聚焦并告诉读屏器在忙，但点击和回车都不触发", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        busy
      </Button>,
    );
    await user.tab();
    const button = screen.getByRole("button", { name: "busy" });
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("进行中把图标换成转圈，不进行时显示传入的图标", () => {
    const { container, rerender } = render(<Button icon="plus">x</Button>);
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("plus");
    rerender(
      <Button icon="plus" loading>
        x
      </Button>,
    );
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("spinner");
  });

  it("变体写成 data-variant，默认是 neutral", () => {
    render(
      <>
        <Button>a</Button>
        <Button variant="destructive">b</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "a" }).getAttribute("data-variant")).toBe("neutral");
    expect(screen.getByRole("button", { name: "b" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
  });

  it("默认 type 是 button（不在表单里误提交），ref、className 和原生属性透传", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} className="extra" data-testid="b" aria-label="named">
        x
      </Button>,
    );
    const button = screen.getByTestId("b");
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("extra");
    expect(button.getAttribute("aria-label")).toBe("named");
  });

  it("工作台的 data-force-state 原样落在按钮上", () => {
    render(
      <Button data-force-state="hover" data-testid="b">
        x
      </Button>,
    );
    expect(screen.getByTestId("b").getAttribute("data-force-state")).toBe("hover");
  });

  it("变体写错是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #163 variant 只能是四个字符串之一，验证类型拦得住
      <Button variant="danger">x</Button>
    );
    expect(typeOnly).toBeTypeOf("function");
  });

  it("档位不随变体变：四个变体默认都是 md，显式 size 才改档", () => {
    render(
      <>
        <Button variant="primary" size="sm">
          s
        </Button>
        <Button variant="primary">p</Button>
        <Button variant="glass">g</Button>
        <Button>n</Button>
        <Button variant="destructive">d</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "s" }).getAttribute("data-size")).toBe("sm");
    for (const name of ["p", "g", "n", "d"]) {
      expect(screen.getByRole("button", { name }).getAttribute("data-size")).toBe("md");
    }
  });
});
