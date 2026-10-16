import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge.tsx";

const text = (value: string) => value as Localized;

describe("Badge", () => {
  it("显示文字，默认是实线底色的变体", () => {
    render(<Badge>{text("kept")}</Badge>);
    expect(screen.getByText("kept").parentElement?.getAttribute("data-variant")).toBe("solid");
  });

  it("带图标时图标是装饰", () => {
    const { container } = render(
      <Badge variant="violet" icon="spark">
        {text("x")}
      </Badge>,
    );
    expect(container.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  });
});
