import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyableCommand } from "./CopyableCommand.tsx";

const text = (value: string) => value as Localized;

describe("CopyableCommand", () => {
  it("命令原样显示，区域有名字", () => {
    render(<CopyableCommand label={text("cmd")} command="brew install go" />);
    expect(screen.getByRole("group", { name: "cmd" })).toBeTruthy();
    expect(screen.getByText("brew install go")).toBeTruthy();
  });

  it("命令是用户内容：伪语言扫页面时跳过，且等宽", () => {
    render(<CopyableCommand label={text("cmd")} command="npm i" />);
    const code = screen.getByText("npm i");
    expect(code.hasAttribute("data-user-content")).toBe(true);
    expect(code.hasAttribute("data-mono")).toBe(true);
  });
});
