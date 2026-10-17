// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useFlushProject } from "./EditorWorkspace.tsx";
import { mount } from "./test-column.tsx";

// 关闭项目标签页和退出应用前，编辑器先写入或询问（规格 DESKTOP-EDITOR-27、28）

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

const replies = (calls: [string, unknown][]) =>
  calls.filter(([method]) => method === "app.quitReply").map(([, param]) => param);

async function dirtyEditor(autosave: "delay" | "off") {
  const ctx = mount({ "src/App.tsx": "old" }, "src/App.tsx", autosave);
  await screen.findByRole("tab", { name: "App.tsx" });
  await waitFor(() => expect(ctx.hosts).toHaveLength(1));
  act(() => ctx.hosts[0]?.edit("src/App.tsx", "刚输入"));
  return ctx;
}

describe("退出前（⌘Q）", () => {
  it("[DESKTOP-EDITOR-27] 延迟档刚输入就退出：先回 ack，磁盘上有了刚输入的内容，再回 proceed", async () => {
    const ctx = await dirtyEditor("delay");
    ctx.emit("app.quitRequested", { id: 7 });
    await waitFor(() => expect(replies(ctx.calls)).toHaveLength(2));
    expect(replies(ctx.calls)).toEqual([
      { id: 7, reply: "ack" },
      { id: 7, reply: "proceed" },
    ]);
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });

  it("[DESKTOP-EDITOR-28] 关闭档有未保存的修改：先询问，选“取消”回 cancel，修改还在、磁盘没动", async () => {
    const ctx = await dirtyEditor("off");
    ctx.emit("app.quitRequested", { id: 8 });
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 8, reply: "cancel" }));
    expect(replies(ctx.calls)).not.toContainEqual({ id: 8, reply: "proceed" });
    expect(ctx.disk.writes).toEqual([]);
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
  });

  it("[DESKTOP-EDITOR-28] 关闭档选“保存”：写入后回 proceed", async () => {
    const ctx = await dirtyEditor("off");
    ctx.emit("app.quitRequested", { id: 9 });
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(replies(ctx.calls)).toContainEqual({ id: 9, reply: "proceed" }));
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });
});

describe("关闭项目标签页前", () => {
  function Probe({ onResult }: { onResult: (proceed: boolean) => void }) {
    const flush = useFlushProject();
    return (
      <button type="button" data-probe="" onClick={() => void flush("demo").then(onResult)}>
        x
      </button>
    );
  }

  it("[DESKTOP-EDITOR-27] 延迟档刚输入就关项目标签页：写入完成后才放行", async () => {
    const results: boolean[] = [];
    const ctx = mount(
      { "src/App.tsx": "old" },
      "src/App.tsx",
      "delay",
      <Probe onResult={(proceed) => results.push(proceed)} />,
    );
    await screen.findByRole("tab", { name: "App.tsx" });
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "刚输入"));
    expect(ctx.disk.writes).toEqual([]);
    await userEvent.click(document.querySelector("[data-probe]") as HTMLElement);
    await waitFor(() => expect(results).toEqual([true]));
    expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });

  it("[DESKTOP-EDITOR-27] 写入失败：不放行（项目标签页留着），修改还在", async () => {
    const results: boolean[] = [];
    const ctx = mount(
      { "src/App.tsx": "old" },
      "src/App.tsx",
      "delay",
      <Probe onResult={(proceed) => results.push(proceed)} />,
    );
    await screen.findByRole("tab", { name: "App.tsx" });
    await waitFor(() => expect(ctx.hosts).toHaveLength(1));
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "刚输入"));
    ctx.disk.failNextWrite = "read-only";
    await userEvent.click(document.querySelector("[data-probe]") as HTMLElement);
    await waitFor(() => expect(results).toEqual([false]));
    expect(screen.getByRole("tab", { name: "App.tsx（未保存）" })).toBeTruthy();
  });
});
