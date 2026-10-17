// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tabNames } from "./test-column.tsx";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

// Base UI 的弹窗和按钮在 jsdom 里要 getAnimations
(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

describe("编辑器列", () => {
  it("[DESKTOP-EDITOR-15] 文件树经 openFile 打开文件：同一个文件只开一个标签，再开只是切过去", async () => {
    const ctx = mount({ "src/App.tsx": "a", "src/main.tsx": "b" });
    await screen.findByRole("tab", { name: "App.tsx" });
    ctx.openFile("src/main.tsx");
    await screen.findByRole("tab", { name: "main.tsx", selected: true });
    ctx.openFile("src/App.tsx");
    await screen.findByRole("tab", { name: "App.tsx", selected: true });
    expect(tabNames()).toEqual(["App.tsx", "main.tsx"]);
  });

  it("[DESKTOP-EDITOR-16] 输入后标签带未保存标记、状态区写“未保存”，按 ⌘S 后写入、状态区写“已保存”", async () => {
    const ctx = mount({ "src/App.tsx": "a" });
    await screen.findByRole("status");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("已保存"));
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "ab"));
    expect(screen.getByRole("status").textContent).toBe("未保存");
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
    await userEvent.keyboard("{Meta>}s{/Meta}");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("已保存"));
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "ab" });
    expect(screen.getByRole("tab", { name: "App.tsx" })).toBeTruthy();
  });

  it("[DESKTOP-EDITOR-17] 按三次 ⌘W：前两次各关一个文件标签，第三次才放行给项目标签页", async () => {
    const ctx = mount({ "src/App.tsx": "a", "src/main.tsx": "b" });
    await screen.findByRole("tab", { name: "App.tsx" });
    ctx.openFile("src/main.tsx");
    await screen.findByRole("tab", { name: "main.tsx", selected: true });
    const press = () => {
      const event = new KeyboardEvent("keydown", {
        key: "w",
        metaKey: true,
        cancelable: true,
        bubbles: true,
      });
      act(() => {
        window.dispatchEvent(event);
      });
      return event;
    };
    const first = press();
    await waitFor(() => expect(screen.queryAllByRole("tab")).toHaveLength(1));
    const second = press();
    await waitFor(() => expect(screen.queryAllByRole("tab")).toHaveLength(0));
    expect(first.defaultPrevented && second.defaultPrevented).toBe(true);
    // 没有文件标签可关：事件不被拦下，标签条的 ⌘W 照常去关项目标签页（弹出关闭确认）
    expect(press().defaultPrevented).toBe(false);
  });

  it("[DESKTOP-EDITOR-19] 自动保存关闭时关闭有修改的标签，询问保存、不保存、取消；取消时标签和修改都在", async () => {
    const ctx = mount({ "src/App.tsx": "a" });
    await screen.findByRole("tab", { name: "App.tsx" });
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "b"));
    await userEvent.click(screen.getByRole("button", { name: "关闭 App.tsx" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("保存对 App.tsx 的修改吗？")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
    expect(ctx.disk.writes).toEqual([]);
  });

  it("[DESKTOP-EDITOR-19] 选“保存”：写入后关闭", async () => {
    const ctx = mount({ "src/App.tsx": "a" });
    await screen.findByRole("tab", { name: "App.tsx" });
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "b"));
    await userEvent.click(screen.getByRole("button", { name: "关闭 App.tsx" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "b" });
  });

  it("[DESKTOP-EDITOR-21] 不是文本的文件：说明原因并提供“在访达中显示”，不显示成文字", async () => {
    const ctx = mount({ "public/logo.png": { kind: "binary", size: 2048 } }, "public/logo.png");
    expect(await screen.findByText("这个文件不是文本")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "在访达中显示" }));
    expect(ctx.calls).toContainEqual([
      "files.reveal",
      { project: "demo", path: "public/logo.png" },
    ]);
  });

  it("[DESKTOP-EDITOR-22] 6 MB 的文本能打开并写明不做高亮，60 MB 的不打开并提供“在外部编辑器中打开”", async () => {
    const six = 6 * 1024 * 1024;
    const ctx = mount(
      {
        "data.json": { kind: "text", content: "{}", size: six },
        "dump.json": { kind: "too-large", size: 60 * 1024 * 1024 },
      },
      "data.json",
    );
    expect(await screen.findByText("文件很大，已关闭语法高亮和智能提示。")).toBeTruthy();
    ctx.openFile("dump.json");
    expect(await screen.findByText("文件太大，没有打开")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "在外部编辑器中打开" }));
    expect(ctx.calls).toContainEqual([
      "files.openExternal",
      { project: "demo", path: "dump.json" },
    ]);
  });

  it("[DESKTOP-EDITOR-54] 1 到 5 MB 的文本当纯文本，并写明“不做语法高亮”", async () => {
    mount({ "mid.json": { kind: "text", content: "{}", size: 3 * 1024 * 1024 } }, "mid.json");
    expect(await screen.findByText("文件较大，不做语法高亮。")).toBeTruthy();
  });

  it("[DESKTOP-EDITOR-39] 应用换成深色时编辑器配色立即跟着换，不重新打开文件", async () => {
    const ctx = mount({ "src/App.tsx": "a" });
    await waitFor(() => expect(ctx.hosts[0]?.syncs.at(-1)?.theme).toBe("light"));
    act(() => document.documentElement.setAttribute("data-theme", "dark"));
    await waitFor(() =>
      expect(ctx.hosts[0]?.syncs.at(-1)).toEqual({ theme: "dark", active: "src/App.tsx" }),
    );
    expect(ctx.hosts).toHaveLength(1);
  });

  it("保存失败时标签条和提示条说明原因，内容和未保存标记都在", async () => {
    const ctx = mount({ "src/App.tsx": "a" });
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    await screen.findByRole("tab", { name: "App.tsx" });
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "b"));
    ctx.disk.failNextWrite = "read-only";
    await userEvent.keyboard("{Meta>}s{/Meta}");
    expect(await screen.findByText(/是只读的/)).toBeTruthy();
    expect(screen.getAllByRole("status").some((node) => node.textContent === "保存失败")).toBe(
      true,
    );
    await userEvent.click(screen.getByRole("button", { name: "再保存一次" }));
    await waitFor(() => expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "b" }));
  });

  it("上次打开的文件标签在重新打开项目时恢复", async () => {
    window.localStorage.setItem(
      "runyard.openFiles.demo",
      JSON.stringify({ paths: ["src/App.tsx", "src/App.css"], active: "src/App.css" }),
    );
    mount({ "src/App.tsx": "a", "src/App.css": "b" });
    await screen.findByRole("tab", { name: "App.css", selected: true });
    expect(tabNames()).toEqual(["App.tsx", "App.css"]);
  });
});

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
