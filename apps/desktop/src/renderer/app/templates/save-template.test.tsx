// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SaveTemplateRequest } from "../../../shared/templates-view.ts";
import { libraryOf, plan, project, setupWorld } from "./templates-world.tsx";

afterEach(cleanup);

const hono = {
  id: "hono",
  name: { en: "Hono", "zh-CN": "Hono" },
  description: "说明",
  category: "service" as const,
  unmaintained: false,
};

function world(saved: { request: SaveTemplateRequest }[] = [], locale: "zh-CN" | "en" = "zh-CN") {
  return setupWorld({ library: libraryOf([hono], [project]), plan, saved, rows: [] }, locale);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  const table = await screen.findByRole("table", { name: "项目列表" });
  await act(async () => {});
  await user.click(within(table).getByRole("button", { name: "hono-todo-api 的更多操作" }));
  const menu = await screen.findByRole("menu");
  const item = within(menu).getByRole("menuitem", { name: "另存为模板…" });
  expect(item.getAttribute("aria-disabled")).not.toBe("true");
  await user.click(item);
  return await screen.findByRole("dialog", { name: "另存为模板" });
}

// 第一次画外壳和弹窗要付冷启动的代价（#219、#234、#277 同类），提前热身
beforeAll(async () => {
  world();
  await screen.findByRole("table", { name: "项目列表" });
  cleanup();
});

describe("另存为模板弹窗", () => {
  it("[DESKTOP-TEMPLATES-VIEW-07] 项目 hono-todo-api 的更多菜单选“另存为模板…”：src、package.json 已勾选；node_modules、.env、dist 在“默认不包含”下未勾选并写明原因；运行环境沿用 Hono；变量开关是开的", async () => {
    const user = userEvent.setup();
    world();
    const dialog = await openDialog(user);
    expect(within(dialog).getByText(/把 hono-todo-api 现在的样子存成模板/)).toBeTruthy();
    const checked = (path: string) =>
      (within(dialog).getByRole("checkbox", { name: path }) as HTMLElement).getAttribute(
        "aria-checked",
      );
    expect(checked("src")).toBe("true");
    expect(checked("package.json")).toBe("true");
    expect(checked("src/index.ts")).toBe("true");
    for (const path of ["node_modules", ".env", "dist"]) expect(checked(path)).toBe("false");
    expect(within(dialog).getByText("默认不包含")).toBeTruthy();
    expect(within(dialog).getByText("依赖，不包含")).toBeTruthy();
    expect(within(dialog).getByText("可能含密钥，默认不包含")).toBeTruthy();
    expect(within(dialog).getByText("构建产物，不包含")).toBeTruthy();
    const requires = within(dialog).getByText(/沿用原模板 Hono：/).textContent ?? "";
    expect(requires).toContain("Node ≥ 20.19 且 < 27");
    expect(requires).toContain("pnpm ≥ 9");
    const toggle = within(dialog).getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByText(/~\/\.runyard\/templates/)).toBeTruthy();
  });

  it("[DESKTOP-TEMPLATES-VIEW-08] 标识填 todo-api 而它已被占用：标识下写明已被占用，“保存模板”不可点", async () => {
    const user = userEvent.setup();
    world();
    const dialog = await openDialog(user);
    const id = within(dialog).getByRole("textbox", { name: "模板标识" });
    await user.clear(id);
    await user.type(id, "todo-api");
    expect(await within(dialog).findByText("这个标识已经被占用，换一个")).toBeTruthy();
    expect(
      (within(dialog).getByRole("button", { name: "保存模板" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.clear(id);
    await user.type(id, "Bad Id");
    expect(
      await within(dialog).findByText(/只能用小写字母、数字和连字符，首尾不能是连字符/),
    ).toBeTruthy();
  });

  it("[DESKTOP-TEMPLATES-VIEW-09] 填好名称和标识点“保存模板”：弹窗关闭；⌘N 打开选择器，“我的”分组里有它", async () => {
    const user = userEvent.setup();
    const saved: { request: SaveTemplateRequest }[] = [];
    const { emit } = world(saved);
    const dialog = await openDialog(user);
    const name = within(dialog).getByRole("textbox", { name: "模板名称" });
    await user.clear(name);
    await user.type(name, "待办接口起步");
    const id = within(dialog).getByRole("textbox", { name: "模板标识" });
    await user.clear(id);
    await user.type(id, "my-todo");
    await user.click(within(dialog).getByRole("button", { name: "保存模板" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "另存为模板" })).toBeNull());
    expect(saved[0]?.request).toEqual({
      playground: "hono-todo-api",
      id: "my-todo",
      name: "待办接口起步",
      description: "",
      replaceName: true,
      include: [],
      exclude: [],
    });
    act(() => emit("picker.open"));
    const picker = await screen.findByRole("dialog", { name: "选择模板" });
    const mine = within(picker)
      .getAllByRole("group")
      .find((group) => group.getAttribute("aria-label") === "我的") as HTMLElement;
    expect(within(mine).getByRole("option", { name: /待办接口起步/ })).toBeTruthy();
  });

  it("[DESKTOP-TEMPLATES-VIEW-10] 在“默认不包含”里勾上 .env 再保存：请求里 include 带 .env；去掉某个文件的勾进 exclude", async () => {
    const user = userEvent.setup();
    const saved: { request: SaveTemplateRequest }[] = [];
    world(saved);
    const dialog = await openDialog(user);
    const id = within(dialog).getByRole("textbox", { name: "模板标识" });
    await user.clear(id);
    await user.type(id, "with-env");
    await user.click(within(dialog).getByRole("checkbox", { name: ".env" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "tsconfig.json" }));
    await user.click(within(dialog).getByRole("button", { name: "保存模板" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.request).toMatchObject({ include: [".env"], exclude: ["tsconfig.json"] });
  });

  it("英文界面：同一份弹窗的文案走英文", async () => {
    const user = userEvent.setup();
    world([], "en");
    const table = await screen.findByRole("table", { name: "Playgrounds" });
    await act(async () => {});
    await user.click(within(table).getByRole("button", { name: /More actions/ }));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Save as template…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Save as template" });
    expect(within(dialog).getByText("Not included by default")).toBeTruthy();
    expect(within(dialog).getByText(/Same as the original template Hono/)).toBeTruthy();
  });
});
