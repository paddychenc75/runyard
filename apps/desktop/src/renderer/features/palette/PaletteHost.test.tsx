// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandId } from "../../../shared/commands.ts";
import { commandIds } from "../../../shared/commands.ts";
import type {
  BootstrapInfo,
  DesktopBridge,
  DesktopEvents,
} from "../../../shared/desktop-bridge.ts";
import { CommandContext, CommandHost, useCommands } from "../../shared/command-host.tsx";
import { OverlayContext } from "../../shared/overlay-context.tsx";
import { OverlayCounter } from "../../shared/overlay-counter.ts";
import { type WorkspaceFiles, WorkspaceFilesContext } from "../../shared/workspace-files.tsx";
import { PaletteHost } from "./PaletteHost.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => window.localStorage.clear());

const bootstrap = {
  platform: "darwin",
  modKey: "meta",
  locale: "zh-CN",
} as unknown as BootstrapInfo;

interface Setup {
  host: CommandHost;
  overlays: OverlayCounter;
  open: ReturnType<typeof vi.fn>;
  emit: <E extends keyof DesktopEvents>(event: E, payload: DesktopEvents[E]) => void;
  setFiles: (files: string[]) => void;
  user: ReturnType<typeof userEvent.setup>;
  rerender: (project: string | null) => void;
}

function Registrar({ commands }: { commands: Partial<Record<CommandId, (() => void) | null>> }) {
  useCommands(commands);
  return null;
}

function setup(options: {
  commands?: Partial<Record<CommandId, (() => void) | null>>;
  project?: string | null;
  files?: string[];
  locale?: "zh-CN" | "en";
  workspace?: Partial<WorkspaceFiles>;
  fakeTimers?: boolean;
}): Setup {
  const host = new CommandHost();
  const overlays = new OverlayCounter();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let files = options.files ?? [];
  const open = vi.fn();
  const bridge = {
    bootstrap: { ...bootstrap, locale: options.locale ?? "zh-CN" },
    call: vi.fn(async (method: string) =>
      method === "files.listAll" ? { ok: true, value: files } : undefined,
    ),
    on: (event: string, listener: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    },
  } as unknown as DesktopBridge;
  const workspace: WorkspaceFiles = {
    activePath: null,
    openPaths: [],
    openFile: open,
    ...options.workspace,
  };
  const user = userEvent.setup(options.fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {});
  const tree = (project: string | null) => (
    <I18nProvider locale={options.locale ?? "zh-CN"} platform="darwin" catalogs={desktopCatalogs}>
      <OverlayContext.Provider value={overlays}>
        <CommandContext.Provider value={host}>
          <WorkspaceFilesContext.Provider value={workspace}>
            <Registrar commands={options.commands ?? {}} />
            <button type="button" data-testid="editor-area">
              editor
            </button>
            <PaletteHost bridge={bridge} project={project} />
          </WorkspaceFilesContext.Provider>
        </CommandContext.Provider>
      </OverlayContext.Provider>
    </I18nProvider>
  );
  const view = render(tree(options.project === undefined ? "demo" : options.project));
  return {
    host,
    overlays,
    open,
    emit: (event, payload) =>
      act(() => {
        for (const listener of listeners.get(event) ?? []) listener(payload);
      }),
    setFiles: (next) => {
      files = next;
    },
    user,
    rerender: (project) => view.rerender(tree(project)),
  };
}

const noop = () => {};
const optionNames = () =>
  screen.getAllByRole("option").map((option) => option.textContent?.replace(/\s+/g, " ").trim());

describe("命令面板", () => {
  it("[DESKTOP-EDITOR-57] ⌘⇧P 打开：输入框有焦点，最前面是“最近使用”里的命令，有快捷键的右侧显示", async () => {
    window.localStorage.setItem("runyard.palette.recent", JSON.stringify(["app.showTerminal"]));
    const { user } = setup({
      commands: { "app.showTerminal": noop, "editor.save": noop, "project.run": noop },
    });
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    const dialog = await screen.findByRole("dialog", { name: "命令面板" });
    expect(document.activeElement).toBe(within(dialog).getByRole("combobox"));
    expect(within(dialog).getByText("最近使用")).toBeTruthy();
    expect(optionNames()).toEqual(["显示终端", "运行⌘R", "保存⌘S"]);
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("[DESKTOP-EDITOR-58] 中文界面里输入“停止”和“stop”都列出“停止运行”，输入的字符高亮", async () => {
    const { user } = setup({ commands: { "project.stop": noop, "project.run": noop } });
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    await user.keyboard("停止");
    expect(optionNames()).toEqual(["停止运行⌘."]);
    expect(document.querySelector('[role="option"] [class*="hit"]')?.textContent).toBe("停止");
    await user.clear(screen.getByRole("combobox"));
    await user.keyboard("stop");
    expect(optionNames()).toEqual(["停止运行Stop⌘."]);
    expect(
      [...document.querySelectorAll('[role="option"] [class*="hit"]')].map((el) => el.textContent),
    ).toEqual(["Stop"]);
  });

  it("[DESKTOP-EDITOR-59] 只用键盘：输入、↓ 选中、回车执行并关闭面板", async () => {
    const showTerminal = vi.fn();
    const { user } = setup({
      commands: { "app.showTerminal": showTerminal, "app.showOutput": noop },
    });
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    await user.keyboard("终端");
    await user.keyboard("{ArrowDown}{Enter}");
    await vi.waitFor(() => expect(showTerminal).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-60] Esc 关闭：什么命令都没执行，焦点回到打开前的位置", async () => {
    const save = vi.fn();
    const { user } = setup({ commands: { "editor.save": save } });
    const editor = screen.getByTestId("editor-area");
    editor.focus();
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    await user.keyboard("保{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
  });

  it("[DESKTOP-EDITOR-61] 只列能用的命令：没登记的（比如已停止时的“停止运行”）不出现", async () => {
    const { user } = setup({ commands: { "project.run": noop, "project.stop": null } });
    await user.keyboard("{F1}");
    expect(optionNames()).toEqual(["运行⌘R"]);
  });

  it("[DESKTOP-EDITOR-62] 全部登记时，应用命令和编辑器命令都在，名称是当前界面语言", async () => {
    const all = Object.fromEntries(commandIds.map((id) => [id, noop]));
    const { user } = setup({ commands: all });
    await user.keyboard("{F1}");
    const names = optionNames().map((name) => name?.replace(/[⌘⌃⌥⇧A-Z0-9/,. ]+$/, "").trim());
    for (const expected of [
      "新建项目…",
      "打开资源库",
      "设置",
      "关闭标签页",
      "快速打开文件",
      "显示终端",
      "显示输出",
      "运行",
      "停止运行",
      "重启",
      "全部停止",
      "打开运行视图",
      "刷新预览",
      "在浏览器中打开",
      "打开开发者工具",
      "重命名…",
      "编辑备注…",
      "自动清理…",
      "另存为模板…",
      "创建副本",
      "在外部编辑器中打开",
      "在访达中显示",
      "在终端中打开",
      "复制路径",
      "复制链接",
      "移到废纸篓",
      "显示/隐藏侧栏",
      "收起或展开文件树",
      "主题：浅色",
      "主题：深色",
      "主题：跟随系统",
      "保存",
      "关闭文件标签",
      "查找",
      "替换",
      "跳到行…",
      "跳到定义",
      "重命名符号",
      "切换行注释",
      "折叠全部",
      "展开全部",
      "选中所有相同内容",
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it("[DESKTOP-EDITOR-63] F1 和 ⌘⇧P 出现的都是应用的命令面板；按键没有交给编辑器", async () => {
    const { user } = setup({ commands: { "editor.goToLine": noop, "editor.toggleComment": noop } });
    const editorKeys: string[] = [];
    const editor = screen.getByTestId("editor-area");
    editor.addEventListener("keydown", (event) => editorKeys.push(event.key));
    editor.focus();
    await user.keyboard("{F1}");
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeTruthy();
    expect(optionNames()).toEqual(["跳到行…⌃G", "切换行注释⌘/"]);
    await user.keyboard("{Escape}");
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // 修饰键本身会到编辑器，F1 和 p 不会
    expect(editorKeys.filter((key) => key === "F1" || key === "p")).toEqual([]);
  });

  it("[DESKTOP-EDITOR-64] 资源库页也能用：只列登记了的、不依赖项目的命令", async () => {
    const { user } = setup({
      project: null,
      commands: {
        "app.new": noop,
        "app.settings": noop,
        "app.stopAll": noop,
        "app.toggleSidebar": noop,
      },
    });
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    expect(optionNames()).toEqual(["新建项目…⌘N", "设置⌘,", "全部停止", "显示/隐藏侧栏⌃⌘S"]);
  });

  it("[DESKTOP-EDITOR-65] 焦点在预览里：主进程的菜单项发 palette.open，面板照常打开", () => {
    const { emit } = setup({ commands: { "project.run": noop } });
    emit("palette.open", { mode: "commands" });
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeTruthy();
    // 按键又到了一次（两条路同时到）也只有一个面板
    emit("palette.open", { mode: "commands" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-66] 面板显示期间告诉外壳“有浮层”（预览让位），关闭后恢复", async () => {
    const { user, overlays } = setup({ commands: { "project.run": noop } });
    expect(overlays.covers(null)).toBe(false);
    await user.keyboard("{F1}");
    expect(overlays.covers({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    await user.keyboard("{Escape}");
    expect(overlays.covers({ x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it("[DESKTOP-EDITOR-67] ⌘P 里输入 > 变成命令列表，删掉 > 变回文件列表", async () => {
    const { user } = setup({
      commands: { "project.run": noop },
      files: ["src/App.tsx"],
    });
    await user.keyboard("{Meta>}p{/Meta}");
    expect(screen.getByRole("dialog", { name: "快速打开" })).toBeTruthy();
    await user.keyboard(">");
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeTruthy();
    expect(optionNames()).toEqual(["运行⌘R"]);
    await user.keyboard("{Backspace}");
    expect(screen.getByRole("dialog", { name: "快速打开" })).toBeTruthy();
  });

  it("英文界面里命令用英文名；输入中文名同样能找到", async () => {
    const { user } = setup({
      locale: "en",
      commands: { "project.stop": noop, "project.run": noop },
    });
    await user.keyboard("{F1}");
    expect(optionNames()).toEqual(["Run⌘R", "Stop⌘."]);
    await user.keyboard("停止");
    expect(optionNames()).toEqual(["Stop停止运行⌘."]);
  });
});

describe("快速打开", () => {
  const files = [
    "src/App.tsx",
    "src/App.css",
    "src/main.tsx",
    "src/app-shell/index.ts",
    "index.html",
  ];

  it("[DESKTOP-EDITOR-68] 输入为空时先列最近打开的文件（当前文件除外），每行后面写所在文件夹", async () => {
    const { user } = setup({
      files,
      workspace: {
        activePath: "src/App.tsx",
        openPaths: ["src/main.tsx", "src/App.css", "src/App.tsx"],
      },
    });
    await user.keyboard("{Meta>}p{/Meta}");
    expect(screen.getByText("最近打开")).toBeTruthy();
    expect(optionNames()).toEqual(["App.csssrc", "main.tsxsrc"]);
  });

  it("[DESKTOP-EDITOR-69] 模糊匹配：sapp 找得到 src/App.tsx；app 时文件名匹配的排在文件夹匹配的前面", async () => {
    const { user } = setup({ files });
    await user.keyboard("{Meta>}p{/Meta}");
    await vi.waitFor(async () => {
      await user.keyboard("sapp");
      expect(optionNames()).toContain("App.tsxsrc");
    });
    await user.clear(screen.getByRole("combobox"));
    await user.keyboard("app");
    expect(optionNames()).toEqual(["App.csssrc", "App.tsxsrc", "index.tssrc/app-shell"]);
  });

  it("[DESKTOP-EDITOR-70] 回车打开选中的文件并关闭浮层", async () => {
    const { user, open } = setup({ files });
    await user.keyboard("{Meta>}p{/Meta}");
    await vi.waitFor(async () => {
      await user.keyboard("main");
      expect(optionNames()).toEqual(["main.tsxsrc"]);
    });
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("src/main.tsx"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-72] 项目里新建了文件，监听报告后很快能在列表里找到", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, emit, setFiles } = setup({ files: ["src/App.tsx"], fakeTimers: true });
    await vi.advanceTimersByTimeAsync(10);
    setFiles(["src/App.tsx", "src/new-util.ts"]);
    emit("files.changed", {
      project: "demo",
      changes: [{ kind: "add", path: "src/new-util.ts", self: false }],
    });
    await vi.advanceTimersByTimeAsync(2000);
    await user.keyboard("{Meta>}p{/Meta}");
    await user.keyboard("newu");
    expect(optionNames()).toEqual(["new-util.tssrc"]);
  });

  it("[DESKTOP-EDITOR-73] 资源库页上 ⌘P 不打开浮层", async () => {
    const { user } = setup({ project: null, files });
    await user.keyboard("{Meta>}p{/Meta}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
