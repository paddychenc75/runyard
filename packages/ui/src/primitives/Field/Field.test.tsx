import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TextField } from "../TextField/index.ts";
import { Field } from "./Field.tsx";

const label = "Name" as Localized;

describe("Field", () => {
  it("名字关联到输入框，说明作为描述；点名字聚焦输入框", async () => {
    const user = userEvent.setup();
    render(
      <Field
        label={label}
        optionalLabel={"optional" as Localized}
        description={"a folder" as Localized}
      >
        <TextField />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /Name/ });
    expect(input.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText("a folder")).toBeTruthy();
    await user.click(screen.getByText("Name"));
    expect(document.activeElement).toBe(input);
  });

  it("有错误时显示在控件下面、取代说明，控件标成无效", () => {
    render(
      <Field label={label} description={"a folder" as Localized} error={"taken" as Localized}>
        <TextField />
      </Field>,
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("taken")).toBeTruthy();
    expect(screen.queryByText("a folder")).toBeNull();
  });

  it("hideLabel：名字不画出来但读屏器仍读得到，输入框的无障碍名字不变", () => {
    render(
      <Field label={label} hideLabel>
        <TextField />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(screen.getByText("Name").className).toContain("hidden");
  });
});
