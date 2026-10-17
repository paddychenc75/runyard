// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { mount } from "./test-column.tsx";

// 改名、移到废纸篓之前，编辑器先写入未保存的修改（规格 DESKTOP-EDITOR-75 至 78）

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

const replies = (calls: [string, unknown][]) =>
  calls.filter(([method]) => method === "project.flushReply").map(([, param]) => param);

async function dirtyEditor(autosave: "delay" | "off") {
  const ctx = mount({ "src/App.tsx": "old" }, "src/App.tsx", autosave);
  await screen.findByRole("tab", { name: "App.tsx" });
  await waitFor(() => expect(ctx.hosts).toHaveLength(1));
  act(() => ctx.hosts[0]?.edit("src/App.tsx", "刚输入"));
  return ctx;
}

describe("改名前写入", () => {
  it("[DESKTOP-EDITOR-75] 延迟档刚输入、还没到 1 秒就改名：不询问，先回 ack，磁盘上有了刚输入的内容，再回 proceed", async () => {
    const ctx = await dirtyEditor("delay");
    expect(ctx.disk.writes).toEqual([]);
    ctx.emit("project.flushRequested", { id: 1, project: "demo", ask: true });
    await waitFor(() => expect(replies(ctx.calls)).toHaveLength(2));
    expect(replies(ctx.calls)).toEqual([
      { id: 1, reply: "ack" },
      { id: 1, reply: "proceed" },
    ]);
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-76] 关闭档有未保存的修改：改名先问，选“取消”回 cancel，修改还在、磁盘没动", async () => {
    const ctx = await dirtyEditor("off");
    ctx.emit("project.flushRequested", { id: 2, project: "demo", ask: true });
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 2, reply: "cancel" }));
    expect(replies(ctx.calls)).not.toContainEqual({ id: 2, reply: "proceed" });
    expect(ctx.disk.writes).toEqual([]);
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
  });
});

describe("移到废纸篓前写入", () => {
  it("[DESKTOP-EDITOR-77] 延迟档刚输入就在应用里移到废纸篓：不询问，写入后回 proceed", async () => {
    const ctx = await dirtyEditor("delay");
    ctx.emit("project.flushRequested", { id: 3, project: "demo", ask: true });
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 3, reply: "proceed" }));
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-78] 命令行移走（ask 为假）：自动保存关着也不询问，直接写入，回 proceed", async () => {
    const ctx = await dirtyEditor("off");
    ctx.emit("project.flushRequested", { id: 4, project: "demo", ask: false });
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 4, reply: "proceed" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });

  it("[DESKTOP-EDITOR-78] 命令行移走时写入失败：回 cancel（修改还留在编辑器里），不丢", async () => {
    const ctx = await dirtyEditor("off");
    ctx.disk.failNextWrite = "read-only";
    ctx.emit("project.flushRequested", { id: 5, project: "demo", ask: false });
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 5, reply: "cancel" }));
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
  });

  it("没有这个项目的会话（没打开过）：没有要写的，直接放行", async () => {
    const ctx = await dirtyEditor("off");
    ctx.emit("project.flushRequested", { id: 6, project: "other", ask: false });
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 6, reply: "proceed" }));
    expect(ctx.disk.writes).toEqual([]);
  });
});
