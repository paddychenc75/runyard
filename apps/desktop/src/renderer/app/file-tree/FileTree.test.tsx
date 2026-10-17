// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree.tsx";
import { type FakeFiles, fakeFiles } from "./fake-files-bridge.ts";
import type { FileTreeHost } from "./use-file-tree.ts";

afterEach(cleanup);

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const PROJECT: Record<string, string | null> = {
  src: null,
  "src/App.css": "",
  "src/App.tsx": "export default 1",
  "src/main.tsx": "",
  "src/old.ts": "old",
  "src/components": null,
  "src/components/Button.tsx": "",
  ".git": null,
  ".runyard": null,
  node_modules: null,
  "node_modules/react": null,
  "package.json": "{}",
  "index.html": "",
};

// 菜单和行内输入第一次用到时要冷启动（Base UI 的菜单、输入链路），慢的 CI 虚拟机上能拖到 5 秒以上，
// 全落在用到菜单的头一个用例里（和 vitest.setup.tsx 里的弹窗热身同一个原因）。在装载阶段先走一遍
beforeAll(async () => {
  const files = fakeFiles(PROJECT);
  const user = userEvent.setup();
  render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <FileTree bridge={files.bridge} project="demo" host={hostOf()} />
    </I18nProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "在项目根新建" }));
  await user.click(await screen.findByRole("menuitem", { name: "新建文件" }));
  await user.keyboard("warmup{Enter}");
  await screen.findByRole("treeitem", { name: "warmup" });
  cleanup();
}, 30_000);

function hostOf(extra: Partial<FileTreeHost> = {}) {
  const host = {
    activePath: null,
    openFile: vi.fn(),
    onRenamed: vi.fn(),
    onTrashed: vi.fn(),
    ...extra,
  } satisfies FileTreeHost;
  return host;
}

function setup(files: FakeFiles, host: FileTreeHost = hostOf(), locale: "zh-CN" | "en" = "zh-CN") {
  const view = (h: FileTreeHost) => (
    <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
      <FileTree bridge={files.bridge} project="demo" host={h} />
    </I18nProvider>
  );
  const utils = render(view(host));
  return { host, user: userEvent.setup(), rerender: (h: FileTreeHost) => utils.rerender(view(h)) };
}

const item = (name: string) => screen.getByRole("treeitem", { name });
const names = () => screen.getAllByRole("treeitem").map((row) => row.textContent);

async function expandSrc(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("treeitem", { name: "src" }));
  await screen.findByRole("treeitem", { name: "App.tsx" });
}

describe("文件树：显示", () => {
  it("[DESKTOP-EDITOR-01] 列出项目文件夹的内容，文件夹在前，编辑器里打开的文件被高亮", async () => {
    const files = fakeFiles(PROJECT);
    const { user, rerender } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    expect(names()).toEqual(["node_modules", "src", "index.html", "package.json"]);
    await user.click(item("src"));
    await screen.findByRole("treeitem", { name: "App.tsx" });
    // 文件夹在前、各自按名字排；子项缩进更深
    expect(names()).toEqual([
      "node_modules",
      "src",
      "components",
      "App.css",
      "App.tsx",
      "main.tsx",
      "old.ts",
      "index.html",
      "package.json",
    ]);
    expect(item("App.tsx").getAttribute("aria-level")).toBe("2");
    expect(item("App.tsx").hasAttribute("data-active")).toBe(false);
    rerender(hostOf({ activePath: "src/App.tsx" }));
    expect(item("App.tsx").hasAttribute("data-active")).toBe(true);
    expect(item("App.tsx").getAttribute("aria-current")).toBe("true");
    expect(item("main.tsx").hasAttribute("data-active")).toBe(false);
  });

  it("[DESKTOP-EDITOR-02] 不显示 .runyard 和 .git；node_modules 折叠，展开才去读它", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await screen.findByRole("treeitem", { name: "node_modules" });
    expect(screen.queryByRole("treeitem", { name: ".git" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: ".runyard" })).toBeNull();
    const folder = item("node_modules");
    expect(folder.getAttribute("aria-expanded")).toBe("false");
    expect(files.listCalls()).toEqual([""]);
    await user.click(folder);
    await screen.findByRole("treeitem", { name: "react" });
    expect(files.listCalls()).toContain("node_modules");
    expect(folder.getAttribute("aria-expanded")).toBe("true");
  });

  it("[DESKTOP-EDITOR-03] 命令行在项目里新建、删除文件，树自己更新，没有手动刷新", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await expandSrc(user);
    files.external(
      (fs) => {
        fs.set("src/new.ts", "");
        fs.delete("src/old.ts");
      },
      [
        { kind: "add", path: "src/new.ts", self: false },
        { kind: "remove", path: "src/old.ts", self: false },
      ],
    );
    await screen.findByRole("treeitem", { name: "new.ts" });
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "old.ts" })).toBeNull());
  });

  it("监听随树开始、随树结束，外部新增的文件自动出现", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    expect(files.call).toHaveBeenCalledWith("files.watch", { project: "demo" });
    const before = files.listCalls().length;
    files.external((fs) => fs.set("x.ts", ""), [{ kind: "add", path: "x.ts", self: false }]);
    await screen.findByRole("treeitem", { name: "x.ts" });
    expect(files.listCalls().length).toBeGreaterThan(before);
    cleanup();
    expect(files.call).toHaveBeenCalledWith("files.unwatch", { project: "demo" });
    void user;
  });
});

describe("文件树：新建", () => {
  it("[DESKTOP-EDITOR-05] 在 src 上选“新建文件”，输入名字回车：磁盘上出现空文件，树选中它并打开", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await expandSrc(user);
    fireEvent.contextMenu(item("src"));
    await user.click(await screen.findByRole("menuitem", { name: "新建文件" }));
    await user.keyboard("utils.ts{Enter}");
    await screen.findByRole("treeitem", { name: "utils.ts" });
    expect(files.fs.get("src/utils.ts")).toBe("");
    expect(files.call).toHaveBeenCalledWith("files.create", {
      project: "demo",
      path: "src",
      kind: "file",
      name: "utils.ts",
    });
    expect(item("utils.ts").hasAttribute("data-selected")).toBe(true);
    expect(host.openFile).toHaveBeenCalledWith("src/utils.ts");
  });

  it("[DESKTOP-EDITOR-06] 在项目根上选“新建文件夹”：磁盘上出现空文件夹，树里显示它", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    await user.click(screen.getByRole("button", { name: "在项目根新建" }));
    await user.click(await screen.findByRole("menuitem", { name: "新建文件夹" }));
    await user.keyboard("lib{Enter}");
    await screen.findByRole("treeitem", { name: "lib" });
    expect(files.fs.get("lib")).toBeNull();
    expect(files.fs.has("lib")).toBe(true);
    expect(item("lib").getAttribute("aria-expanded")).toBe("false");
    expect(host.openFile).not.toHaveBeenCalled();
  });

  it("[DESKTOP-EDITOR-07] 同名时输入框旁提示已存在，输入框保留，原文件内容不变", async () => {
    const files = fakeFiles({ ...PROJECT, "src/utils.ts": "keep me" });
    const { user, host } = setup(files);
    await expandSrc(user);
    fireEvent.contextMenu(item("src"));
    await user.click(await screen.findByRole("menuitem", { name: "新建文件" }));
    await user.keyboard("utils.ts{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("utils.ts");
    expect(alert.textContent).toContain("已经有");
    expect(screen.getByRole("textbox", { name: "新文件或文件夹的名称" })).toBeTruthy();
    expect(files.fs.get("src/utils.ts")).toBe("keep me");
    expect(host.openFile).not.toHaveBeenCalled();
  });

  it.each([
    ["", "不能是空的"],
    ["a/b", "斜杠"],
    [".", "不能是“.”或“..”"],
    ["..", "不能是“.”或“..”"],
  ])("[DESKTOP-EDITOR-08] 名字 %j 被拒绝：说明原因，磁盘没有变化", async (name, reason) => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    const before = JSON.stringify([...files.fs]);
    await user.click(screen.getByRole("button", { name: "在项目根新建" }));
    await user.click(await screen.findByRole("menuitem", { name: "新建文件" }));
    if (name !== "") await user.keyboard(name);
    await user.keyboard("{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain(reason);
    expect(JSON.stringify([...files.fs])).toBe(before);
  });

  it("[DESKTOP-EDITOR-08] 重命名时输入不合法的名字同样被拒绝", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await expandSrc(user);
    item("main.tsx").focus();
    await user.keyboard("{F2}");
    await user.keyboard("{Control>}a{/Control}a/b{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain("斜杠");
    expect(files.fs.has("src/main.tsx")).toBe(true);
    expect(host.onRenamed).not.toHaveBeenCalled();
  });

  it("Esc 取消新建，什么都没有创建", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    await user.click(screen.getByRole("button", { name: "在项目根新建" }));
    await user.click(await screen.findByRole("menuitem", { name: "新建文件" }));
    await user.keyboard("abc{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(files.call).not.toHaveBeenCalledWith("files.create", expect.anything());
  });
});

describe("文件树：重命名", () => {
  it("[DESKTOP-EDITOR-09] 重命名已打开的文件：磁盘只剩新名字，通知工作区把标签改成新路径", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files, hostOf({ activePath: "src/App.tsx" }));
    await expandSrc(user);
    fireEvent.contextMenu(item("App.tsx"));
    await user.click(await screen.findByRole("menuitem", { name: /^重命名/ }));
    await user.keyboard("{Control>}a{/Control}Main.tsx{Enter}");
    await screen.findByRole("treeitem", { name: "Main.tsx" });
    expect(files.fs.has("src/Main.tsx")).toBe(true);
    expect(files.fs.has("src/App.tsx")).toBe(false);
    expect(host.onRenamed).toHaveBeenCalledWith("src/App.tsx", "src/Main.tsx");
  });

  it("[DESKTOP-EDITOR-10] 重命名文件夹：展开的子项跟着走，通知工作区改路径", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await expandSrc(user);
    await user.click(item("components"));
    await screen.findByRole("treeitem", { name: "Button.tsx" });
    item("components").focus();
    await user.keyboard("{F2}{Control>}a{/Control}ui{Enter}");
    await screen.findByRole("treeitem", { name: "ui" });
    expect(host.onRenamed).toHaveBeenCalledWith("src/components", "src/ui");
    expect(files.fs.has("src/ui/Button.tsx")).toBe(true);
    // 新路径下它仍是展开的
    await screen.findByRole("treeitem", { name: "Button.tsx" });
    expect(item("ui").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("文件树：移到废纸篓", () => {
  it("[DESKTOP-EDITOR-11] 选中文件按 ⌘⌫：不弹确认，树里不再有它，通知工作区关标签，提示“已移到废纸篓”", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await expandSrc(user);
    await user.click(item("old.ts"));
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "old.ts" })).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(files.trashed).toEqual([{ path: "src/old.ts", unsaved: undefined }]);
    expect(host.onTrashed).toHaveBeenCalledWith("src/old.ts");
    expect((await screen.findByRole("status", { name: "文件操作的结果" })).textContent).toBe(
      "已移到废纸篓",
    );
  });

  it("[DESKTOP-EDITOR-12] 文件有未保存的修改：先把内容交给文件服务一起写进去再移走", async () => {
    const files = fakeFiles(PROJECT);
    const unsavedContent = vi.fn((path: string) => (path === "src/old.ts" ? "edited" : undefined));
    const { user } = setup(files, hostOf({ unsavedContent }));
    await expandSrc(user);
    fireEvent.contextMenu(item("old.ts"));
    await user.click(await screen.findByRole("menuitem", { name: /^移到废纸篓/ }));
    await waitFor(() => expect(files.trashed).toHaveLength(1));
    expect(files.trashed[0]).toEqual({ path: "src/old.ts", unsaved: "edited" });
  });

  it("[DESKTOP-EDITOR-13] 放不进废纸篓：提示失败和原因，文件还在，文件标签不受影响", async () => {
    const files = fakeFiles({ ...PROJECT, "src/locked.ts": "x" });
    files.locked.add("src/locked.ts");
    const { user, host } = setup(files);
    await expandSrc(user);
    await user.click(item("locked.ts"));
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    const notice = await screen.findByRole("status", { name: "文件操作的结果" });
    expect(notice.textContent).toContain("locked.ts");
    expect(notice.textContent).toContain("没有被删除");
    expect(screen.getByRole("treeitem", { name: "locked.ts" })).toBeTruthy();
    expect(files.fs.has("src/locked.ts")).toBe(true);
    expect(host.onTrashed).not.toHaveBeenCalled();
  });
});

describe("文件树：键盘", () => {
  it("[DESKTOP-EDITOR-14] 只用键盘：方向键移到 App.tsx 回车打开；在另一个文件上 F2 改名回车；焦点始终在树里", async () => {
    const files = fakeFiles(PROJECT);
    const { user, host } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    // Tab 进入树：落在第一行
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(item("node_modules"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("src"));
    await user.keyboard("{ArrowRight}");
    await screen.findByRole("treeitem", { name: "App.tsx" });
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item("App.tsx"));
    await user.keyboard("{Enter}");
    expect(host.openFile).toHaveBeenCalledWith("src/App.tsx");
    await user.keyboard("{ArrowDown}{F2}");
    const input = screen.getByRole("textbox", { name: "新名称" });
    expect(document.activeElement).toBe(input);
    await user.keyboard("{Control>}a{/Control}index.tsx{Enter}");
    await screen.findByRole("treeitem", { name: "index.tsx" });
    expect(files.fs.has("src/index.tsx")).toBe(true);
    // 改名完成后焦点回到树里的那一行
    await waitFor(() => expect(document.activeElement).toBe(item("index.tsx")));
  });

  it("左键收起、再左键回到父文件夹；Home 和 End 到头尾", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await expandSrc(user);
    item("App.tsx").focus();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(item("src"));
    await user.keyboard("{ArrowLeft}");
    expect(item("src").getAttribute("aria-expanded")).toBe("false");
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("package.json"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("node_modules"));
  });

  it("菜单键在焦点行上打开菜单，菜单项能用键盘选", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files);
    await screen.findByRole("treeitem", { name: "src" });
    item("src").focus();
    await user.keyboard("{ContextMenu}");
    const menu = await screen.findByRole("menu", { name: "文件树的操作" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((entry) => entry.textContent),
    ).toEqual(["新建文件", "新建文件夹", "重命名F2", "移到废纸篓"]);
  });
});

describe("文件树：语言", () => {
  it("英文：标题、提示和菜单用英文", async () => {
    const files = fakeFiles(PROJECT);
    const { user } = setup(files, hostOf(), "en");
    await screen.findByRole("treeitem", { name: "src" });
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByRole("tree", { name: "File tree" })).toBeTruthy();
    await user.click(item("src"));
    await screen.findByRole("treeitem", { name: "old.ts" });
    await user.click(item("old.ts"));
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect((await screen.findByRole("status")).textContent).toBe("Moved to Trash");
  });
});
