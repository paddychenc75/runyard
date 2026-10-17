// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { mount } from "./test-column.tsx";

// 自动保存和外部修改在编辑器列上的样子：状态区、提示条、文件标签（规格 desktop/editor）。逻辑本身在 autosave.test.ts 与 external-change.test.ts。

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

const status = () => screen.getAllByRole("status").map((node) => node.textContent);

async function typed(autosave: "delay" | "blur" | "off" | "default" = "delay") {
  const ctx = mount({ "src/App.tsx": "old", "src/main.tsx": "m" }, "src/App.tsx", autosave);
  await screen.findByRole("tab", { name: "App.tsx" });
  await waitFor(() => expect(ctx.hosts).toHaveLength(1));
  act(() => ctx.hosts[0]?.edit("src/App.tsx", "我的修改"));
  return ctx;
}

const change = (path: string, kind: "change" | "remove" | "add" = "change") => ({
  project: "demo",
  changes: [{ kind, path, self: false }],
});

describe("自动保存的界面", () => {
  it("[DESKTOP-EDITOR-23] 延迟档：停下约 1 秒后磁盘与编辑器一致，状态区显示“已保存”", async () => {
    const ctx = await typed();
    expect(status()).toContain("未保存");
    await waitFor(
      () => expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" }),
      {
        timeout: 3000,
      },
    );
    await waitFor(() => expect(status()).toContain("已保存"));
  });

  it("[DESKTOP-EDITOR-23] 外壳没有给档位（设置页还没做）时用默认档：停止输入后自己写入", async () => {
    const ctx = await typed("default");
    await waitFor(
      () => expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" }),
      { timeout: 3000 },
    );
  });

  it("[DESKTOP-EDITOR-24] 失去焦点档：焦点移出编辑器区域时写入", async () => {
    const ctx = await typed("blur");
    expect(ctx.disk.writes).toEqual([]);
    const outside = document.createElement("button");
    document.body.append(outside);
    const section = document.querySelector("[data-editor]") as HTMLElement;
    const inside = section.querySelector("[role=tab]") as HTMLElement;
    act(() => inside.focus());
    act(() => outside.focus());
    await waitFor(() =>
      expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" }),
    );
    outside.remove();
  });

  it("[DESKTOP-EDITOR-24] 失去焦点档：窗口失去焦点（切到别的应用）时写入", async () => {
    const ctx = await typed("blur");
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await waitFor(() => expect(ctx.disk.writes).toHaveLength(1));
  });
});

describe("外部修改的界面", () => {
  it("[DESKTOP-EDITOR-31] 没有未保存修改时，外部改写后编辑器列里换成新内容，没有提示", async () => {
    const ctx = mount({ "src/App.tsx": "old" }, "src/App.tsx", "off");
    await screen.findByRole("tab", { name: "App.tsx" });
    ctx.disk.files.set("src/App.tsx", { kind: "text", content: "new" });
    ctx.emit("files.changed", change("src/App.tsx"));
    await waitFor(() => expect(ctx.hosts[0]?.syncs.length).toBeGreaterThan(1));
    expect(screen.queryByRole("button", { name: "用磁盘上的版本" })).toBeNull();
  });

  it("[DESKTOP-EDITOR-32] 有未保存修改时文件上方出现提示和两个选择，状态区写“磁盘上有改动”，等 3 秒也不覆盖", async () => {
    const ctx = await typed();
    ctx.disk.files.set("src/App.tsx", { kind: "text", content: "命令行写的" });
    ctx.emit("files.changed", change("src/App.tsx"));
    expect(await screen.findByRole("button", { name: "用磁盘上的版本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "保留我的修改" })).toBeTruthy();
    expect(status()).toContain("磁盘上有改动");
    // 3 秒内不覆盖的计时验证在 external-change.test.ts；这里确认提示出现时磁盘没被写
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "命令行写的" });
    expect(ctx.disk.writes).toEqual([]);
  });

  it("[DESKTOP-EDITOR-33] 点“用磁盘上的版本”：提示和未保存标记消失", async () => {
    const ctx = await typed();
    ctx.disk.files.set("src/App.tsx", { kind: "text", content: "命令行写的" });
    ctx.emit("files.changed", change("src/App.tsx"));
    await userEvent.click(await screen.findByRole("button", { name: "用磁盘上的版本" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "保留我的修改" })).toBeNull());
    expect(status()).toContain("已保存");
    expect(screen.getByRole("tab", { name: "App.tsx" })).toBeTruthy();
  });

  it("[DESKTOP-EDITOR-34] 点“保留我的修改”：写入磁盘，提示消失，状态区显示“已保存”", async () => {
    const ctx = await typed();
    ctx.disk.files.set("src/App.tsx", { kind: "text", content: "命令行写的" });
    ctx.emit("files.changed", change("src/App.tsx"));
    await userEvent.click(await screen.findByRole("button", { name: "保留我的修改" }));
    await waitFor(() =>
      expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" }),
    );
    await waitFor(() => expect(status()).toContain("已保存"));
    expect(screen.queryByRole("button", { name: "用磁盘上的版本" })).toBeNull();
  });

  it("[DESKTOP-EDITOR-35] 外部删除：标签仍在并标明“已删除”，提示说明按 ⌘S 重新创建；⌘S 后文件回来、标记消失", async () => {
    const ctx = await typed();
    ctx.disk.files.delete("src/App.tsx");
    ctx.emit("files.changed", change("src/App.tsx", "remove"));
    expect(await screen.findByRole("tab", { name: "App.tsx（已删除）" })).toBeTruthy();
    expect(screen.getByText(/按 ⌘S 可以重新创建它/)).toBeTruthy();
    expect(ctx.disk.files.has("src/App.tsx")).toBe(false);
    await userEvent.keyboard("{Meta>}s{/Meta}");
    await waitFor(() =>
      expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" }),
    );
    await waitFor(() => expect(screen.getByRole("tab", { name: "App.tsx" })).toBeTruthy());
  });

  it("[DESKTOP-EDITOR-36] 自己保存引起的变化通知（self）不弹提示", async () => {
    const ctx = await typed("off");
    for (let i = 0; i < 5; i += 1) {
      act(() => ctx.hosts[0]?.edit("src/App.tsx", `第 ${i} 次`));
      await userEvent.keyboard("{Meta>}s{/Meta}");
    }
    await waitFor(() => expect(status()).toContain("已保存"));
    expect(screen.queryByRole("button", { name: "用磁盘上的版本" })).toBeNull();
    expect(within(document.body).queryByText("磁盘上有改动")).toBeNull();
  });
});

describe("换行符不统一的提示", () => {
  it("[DESKTOP-EDITOR-55] 打开时提示一次“保存时会统一成 LF”，保存之后不再提示", async () => {
    const lines = [...Array(8).fill("l\n"), ...Array(2).fill("c\r\n")].join("");
    const ctx = mount({ "mixed.js": lines }, "mixed.js", "off");
    expect(await screen.findByText("这个文件的换行符号不统一，保存时会统一成 LF。")).toBeTruthy();
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("mixed.js", "x"));
    await userEvent.keyboard("{Meta>}s{/Meta}");
    await waitFor(() => expect(screen.queryByText(/换行符号不统一/)).toBeNull());
    expect(ctx.disk.writes[0]).toMatchObject({ eol: "lf" });
  });
});
