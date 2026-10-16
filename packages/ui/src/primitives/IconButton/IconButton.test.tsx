import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton.tsx";

// 测试里造一个“已翻译”的名字；产品代码里 Localized 只能来自文案系统
const label = "close it" as Localized;

describe("IconButton", () => {
  it("名字就是 label，Tab 能到达，Enter 和空格都能触发点击", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="close" label={label} onClick={onClick} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "close it" }));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("禁用时 Tab 跳过，点击不触发", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="close" label={label} disabled onClick={onClick} />);
    await user.tab();
    expect(document.activeElement).toBe(document.body);
    await user.click(screen.getByRole("button", { name: "close it" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("图标是装饰（读屏器只读按钮的名字），默认 type 是 button，ref 和原生属性透传", () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <IconButton ref={ref} icon="close" label={label} data-testid="b" className="extra" />,
    );
    const button = screen.getByTestId("b");
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("extra");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("尺寸和变体写成 data 属性，默认是 md 和 ghost", () => {
    render(
      <>
        <IconButton icon="close" label={label} data-testid="a" />
        <IconButton icon="close" label={label} size="xs" variant="neutral" data-testid="b" />
      </>,
    );
    expect(screen.getByTestId("a").dataset).toMatchObject({ size: "md", variant: "ghost" });
    expect(screen.getByTestId("b").dataset).toMatchObject({ size: "xs", variant: "neutral" });
  });

  it("没有 label 或传普通字符串是类型错误", () => {
    const typeOnly = () => (
      <>
        {/* @ts-expect-error #168 label 必填 */}
        <IconButton icon="close" />
        {/* @ts-expect-error #168 label 只收经过文案系统的 Localized */}
        <IconButton icon="close" label="plain" />
      </>
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});
