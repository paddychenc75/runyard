import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "../Field/index.ts";
import { TextField } from "./TextField.tsx";

describe("TextField", () => {
  it("Tab 能到达，输入触发 onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label={"Name" as Localized}>
        <TextField onChange={(event) => onChange(event.target.value)} />
      </Field>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("ab");
    expect(onChange).toHaveBeenLastCalledWith("ab");
  });

  it("禁用时输入不进去", async () => {
    const user = userEvent.setup();
    render(
      <Field label={"Name" as Localized}>
        <TextField disabled />
      </Field>,
    );
    await user.type(screen.getByRole("textbox"), "x");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });
});
