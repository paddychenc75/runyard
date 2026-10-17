// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { EditorWorkspace, useActiveEditor } from "../features/editor/EditorWorkspace.tsx";
import type { EditorSession } from "../features/editor/editor-session.ts";
import { fakeFiles } from "./file-tree/fake-files-bridge.ts";
import { sampleTab } from "./sample-tab.ts";
import { TabContent } from "./TabContent.tsx";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

// 文件树和编辑器连在一起：树里的改名、移到废纸篓、未保存的内容经 EditorWorkspace 落到文件标签上
function setup() {
  const files = fakeFiles({
    src: null,
    "src/App.tsx": "export default 1",
    "src/old.ts": "old",
  });
  const bridge = {
    ...files.bridge,
    call: async (method: string, param?: { path: string; content?: string }) => {
      if (method === "files.read") {
        const content = files.fs.get(param?.path ?? "");
        return typeof content === "string"
          ? {
              ok: true,
              value: { kind: "text", content, eol: "none", size: content.length, large: false },
            }
          : { ok: false, error: { code: "EDITOR_NOT_FOUND", params: { path: param?.path ?? "" } } };
      }
      if (method === "files.write") {
        files.fs.set(param?.path ?? "", param?.content ?? "");
        return { ok: true, value: { size: 0 } };
      }
      return (files.call as (method: string, param?: unknown) => Promise<unknown>)(method, param);
    },
  } as unknown as DesktopBridge;
  const tab = sampleTab({ id: "demo", name: "demo", entry: null });
  let session: EditorSession | undefined;
  function Probe() {
    session = useActiveEditor().session;
    return null;
  }
  render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <EditorWorkspace bridge={bridge} tabs={[tab]} activeTab="demo">
        <Probe />
        <TabContent bridge={bridge} tab={tab} />
      </EditorWorkspace>
    </I18nProvider>,
  );
  return { files, user: userEvent.setup(), session: () => session as EditorSession };
}

async function openFromTree(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("treeitem", { name: "src" }));
  await user.click(await screen.findByRole("treeitem", { name }));
  await screen.findByRole("tab", { name, selected: true });
}

describe("文件树和文件标签联动", () => {
  it("[DESKTOP-EDITOR-09] 重命名有未保存修改的文件：标签换成新名字，修改还在，⌘S 写进新路径", async () => {
    const { files, user, session } = setup();
    await openFromTree(user, "App.tsx");
    act(() => session().edit("src/App.tsx", "export default 2"));
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "App.tsx" }));
    await user.click(await screen.findByRole("menuitem", { name: /^重命名/ }));
    await user.keyboard("{Control>}a{/Control}Main.tsx{Enter}");
    await screen.findByRole("tab", { name: "Main.tsx（未保存）" });
    expect(session().getState().tabs[0]?.text).toBe("export default 2");
    await user.keyboard("{Meta>}s{/Meta}");
    await waitFor(() => expect(files.fs.get("src/Main.tsx")).toBe("export default 2"));
    expect(files.fs.has("src/App.tsx")).toBe(false);
  });

  it("[DESKTOP-EDITOR-11] 移到废纸篓：文件标签随之关闭，不弹询问", async () => {
    const { files, user } = setup();
    await openFromTree(user, "old.ts");
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "old.ts" }));
    await user.click(await screen.findByRole("menuitem", { name: /^移到废纸篓/ }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "old.ts" })).toBeNull());
    expect(files.trashed).toEqual([{ path: "src/old.ts", unsaved: undefined }]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-12] 移到废纸篓前先保存：有未保存修改的文件把它的内容交给文件服务一起写进去", async () => {
    const { files, user, session } = setup();
    await openFromTree(user, "old.ts");
    act(() => session().edit("src/old.ts", "edited"));
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "old.ts" }));
    await user.click(await screen.findByRole("menuitem", { name: /^移到废纸篓/ }));
    await waitFor(() => expect(files.trashed).toHaveLength(1));
    expect(files.trashed[0]).toEqual({ path: "src/old.ts", unsaved: "edited" });
    await waitFor(() => expect(screen.queryByRole("tab", { name: /old\.ts/ })).toBeNull());
  });
});
