// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAvailableCommands, useCommandHost } from "../../shared/command-host.tsx";
import { mount } from "./test-column.tsx";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];

// 命令面板只列“登记了”的命令；这里直接看编辑器列登记了哪些（宿主是默认的全局那个）
function Probe({ onHost }: { onHost: (host: ReturnType<typeof useCommandHost>) => void }) {
  onHost(useCommandHost());
  return <output data-testid="available">{useAvailableCommands().join(",")}</output>;
}

const EDITOR_COMMANDS = [
  "editor.save",
  "editor.closeTab",
  "editor.find",
  "editor.replace",
  "editor.goToLine",
  "editor.goToDefinition",
  "editor.renameSymbol",
  "editor.toggleComment",
  "editor.foldAll",
  "editor.unfoldAll",
  "editor.selectAllOccurrences",
  "editor.formatDocument",
];

describe("编辑器命令", () => {
  it("[DESKTOP-EDITOR-61] 没有打开任何文件时，没有“保存”“查找”“跳到行…”等编辑器命令", async () => {
    mount({ "src/App.tsx": "a" }, null, "off", <Probe onHost={() => {}} />);
    await screen.findByTestId("available");
    expect(screen.getByTestId("available").textContent).toBe("");
  });

  it("[DESKTOP-EDITOR-62] 打开着文件时，编辑器命令齐全，各自触发对应的编辑器操作", async () => {
    let host: ReturnType<typeof useCommandHost> | undefined;
    const ctx = mount(
      { "src/App.tsx": "a" },
      "src/App.tsx",
      "off",
      <Probe onHost={(value) => (host = value)} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("available").textContent?.split(",").sort()).toEqual(
        [...EDITOR_COMMANDS].sort(),
      ),
    );
    act(() => {
      host?.run("editor.find");
      host?.run("editor.goToLine");
      host?.run("editor.toggleComment");
      host?.run("editor.foldAll");
      host?.run("editor.formatDocument");
    });
    expect(ctx.runs).toEqual(["find", "goToLine", "toggleComment", "foldAll", "formatDocument"]);
  });

  it("[DESKTOP-EDITOR-62] “保存”和“关闭文件标签”与 ⌘S、⌘W 做同样的事", async () => {
    let host: ReturnType<typeof useCommandHost> | undefined;
    const ctx = mount(
      { "src/App.tsx": "a" },
      "src/App.tsx",
      "off",
      <Probe onHost={(value) => (host = value)} />,
    );
    await screen.findByRole("tab", { name: "App.tsx" });
    act(() => ctx.hosts[0]?.edit("src/App.tsx", "ab"));
    await waitFor(() => expect(host?.available()).toContain("editor.save"));
    act(() => {
      host?.run("editor.save");
    });
    await waitFor(() => expect(ctx.disk.files.get("src/App.tsx")).toMatchObject({ content: "ab" }));
    act(() => {
      host?.run("editor.closeTab");
    });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "App.tsx" })).toBeNull());
  });

  it("[DESKTOP-EDITOR-96] Python、Go、其他没有格式化器的文件：命令面板里没有“格式化文档”，其余编辑器命令照常", async () => {
    for (const path of ["main.py", "main.go", "notes.md"]) {
      const ctx = mount({ [path]: "a" }, path, "off", <Probe onHost={() => {}} />);
      await screen.findByRole("tab", { name: path });
      await waitFor(() =>
        expect(screen.getByTestId("available").textContent).toContain("editor.find"),
      );
      expect(screen.getByTestId("available").textContent).not.toContain("editor.formatDocument");
      ctx.view.unmount();
    }
  });

  it("[DESKTOP-EDITOR-99] Vue 文件：语言服务放弃或重启中时命令面板里没有“格式化文档”，恢复后回来", async () => {
    const ctx = mount({ "App.vue": "<template/>" }, "App.vue", "off", <Probe onHost={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId("available").textContent).toContain("editor.formatDocument"),
    );
    ctx.emit("vue.status", { project: "demo", state: "disabled" });
    await waitFor(() =>
      expect(screen.getByTestId("available").textContent).not.toContain("editor.formatDocument"),
    );
    ctx.emit("vue.status", { project: "other", state: "ready" });
    expect(screen.getByTestId("available").textContent).not.toContain("editor.formatDocument");
    ctx.emit("vue.status", { project: "demo", state: "ready" });
    await waitFor(() =>
      expect(screen.getByTestId("available").textContent).toContain("editor.formatDocument"),
    );
    ctx.emit("vue.status", { project: "demo", state: "restarting" });
    await waitFor(() =>
      expect(screen.getByTestId("available").textContent).not.toContain("editor.formatDocument"),
    );
  });
});
