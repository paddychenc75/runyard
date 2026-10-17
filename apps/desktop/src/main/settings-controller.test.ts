import type { Settings } from "@runyard/protocol";
import { describe, expect, it, vi } from "vitest";
import { SettingsController, type SettingsHost } from "./settings-controller.ts";

const base: Settings = {
  libraryRoot: "/Users/me/Runyard",
  packageManager: "auto",
  scriptAutoRun: true,
  cliIdleStopMinutes: 30,
  toolPaths: {},
  ports: { min: 7100, max: 7999 },
  urlNewSkipConfirmForBuiltin: false,
  updateCheck: true,
  autoSave: "delay",
  theme: "system",
  confirmCloseRunningTab: true,
};

function setup(
  options: {
    settings?: Partial<Settings>;
    editors?: string[];
    picked?: string | null;
    fallbackTheme?: Settings["theme"];
  } = {},
) {
  let settings: Settings = { ...base, ...options.settings };
  let onEvent: (() => void) | undefined;
  const calls: { method: string; params: unknown }[] = [];
  const client = {
    call: vi.fn(async (method: string, params: unknown) => {
      calls.push({ method, params });
      if (method === "settings.set") settings = { ...settings, ...(params as Partial<Settings>) };
      return settings;
    }),
    subscribe: vi.fn(async (_topics: string[], listener: () => void) => {
      onEvent = listener;
      return () => {};
    }),
  };
  const host = {
    setTheme: vi.fn(),
    editors: vi.fn(async () =>
      (options.editors ?? ["vscode", "cursor"]).map((id) => ({ id, name: id })),
    ),
    openInEditor: vi.fn(() => true),
    openDefault: vi.fn(),
    chooseFolder: vi.fn(async () => options.picked ?? null),
    revealInFileManager: vi.fn(),
    isPrivacyProtected: (path: string) => path.startsWith("/Users/me/Documents"),
    localeChanged: vi.fn(),
  } satisfies SettingsHost;
  const library = {
    setLocale: vi.fn(),
    reloadLibraryRoot: vi.fn(async () => {}),
    folderOf: vi.fn((id: string) => (id === "demo" ? "/Users/me/Runyard/demo" : null)),
  };
  const controller = new SettingsController({
    client: client as never,
    host,
    library,
    home: "/Users/me",
    fallbackLocale: "zh-CN",
    ...(options.fallbackTheme === undefined ? {} : { fallbackTheme: options.fallbackTheme }),
    initial: settings,
  });
  return {
    controller,
    client,
    host,
    library,
    calls,
    change: (patch: Partial<Settings>) => {
      settings = { ...settings, ...patch };
      onEvent?.();
    },
  };
}

describe("设置控制器", () => {
  it("[DESKTOP-SETTINGS-04] 选“深色”立刻让系统外观跟着变；改回“跟随系统”再变回来", async () => {
    const { controller, host } = setup();
    await controller.set({ theme: "dark" });
    expect(host.setTheme).toHaveBeenLastCalledWith("dark");
    await controller.set({ theme: "system" });
    expect(host.setTheme).toHaveBeenLastCalledWith("system");
    expect(host.setTheme).toHaveBeenCalledTimes(2);
  });

  it("设置里是“跟随系统”时用启动参数给的明暗（开发用），选了浅色或深色就以设置为准", async () => {
    const { controller, host } = setup({ fallbackTheme: "dark" });
    await controller.start();
    expect(controller.themeOf(base)).toBe("dark");
    await controller.set({ theme: "light" });
    expect(host.setTheme).toHaveBeenLastCalledWith("light");
    await controller.set({ theme: "system" });
    expect(host.setTheme).toHaveBeenLastCalledWith("dark");
  });

  it("[DESKTOP-SETTINGS-03] 切到 English：资源库文字的语言和应用菜单立刻换；没写语言时用启动时定的语言", async () => {
    const { controller, host, library } = setup();
    expect(controller.localeOf(base)).toBe("zh-CN");
    await controller.set({ language: "en" });
    expect(library.setLocale).toHaveBeenCalledWith("en");
    expect(host.localeChanged).toHaveBeenCalledWith("en");
  });

  it("没改语言和主题的设置不会重建菜单、不动系统外观", async () => {
    const { controller, host, library } = setup();
    await controller.set({ autoSave: "blur" });
    expect(host.setTheme).not.toHaveBeenCalled();
    expect(library.setLocale).not.toHaveBeenCalled();
    expect(host.localeChanged).not.toHaveBeenCalled();
  });

  it("[DESKTOP-SETTINGS-05] 选的文件夹在“文档”里要带上警告标记；别处没有", async () => {
    const docs = setup({ picked: "/Users/me/Documents/Runyard" });
    expect(await docs.controller.pickLibraryRoot()).toEqual({
      path: "/Users/me/Documents/Runyard",
      display: "~/Documents/Runyard",
      protectedFolder: true,
    });
    const other = setup({ picked: "/Users/me/Work/lib" });
    expect(await other.controller.pickLibraryRoot()).toMatchObject({ protectedFolder: false });
    const cancelled = setup({ picked: null });
    expect(await cancelled.controller.pickLibraryRoot()).toBeNull();
    // 选择本身不改任何设置
    expect(docs.calls.some((call) => call.method === "settings.set")).toBe(false);
  });

  it("[DESKTOP-SETTINGS-06] 换资源库位置：只写设置并让资源库重读新位置，不碰旧位置的文件", async () => {
    const { controller, library, calls } = setup();
    await controller.set({ libraryRoot: "/Users/me/Work/lib" });
    expect(library.reloadLibraryRoot).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.method)).toEqual(["settings.set"]);
  });

  it("[DESKTOP-SETTINGS-07] 列出本机找到的编辑器；选 Cursor 后打开项目文件夹用 Cursor，没选过用找到的第一款", async () => {
    const chosen = setup({ settings: { externalEditor: "cursor" } });
    expect((await chosen.controller.editors()).map((editor) => editor.id)).toEqual([
      "vscode",
      "cursor",
    ]);
    await chosen.controller.openInEditor("demo");
    expect(chosen.host.openInEditor).toHaveBeenCalledWith("cursor", "/Users/me/Runyard/demo");
    const unset = setup();
    await unset.controller.openInEditor("demo");
    expect(unset.host.openInEditor).toHaveBeenCalledWith("vscode", "/Users/me/Runyard/demo");
  });

  it("没有编辑器可用时用系统默认的方式打开；项目不存在什么都不做", async () => {
    const { controller, host } = setup({ editors: [] });
    await controller.openInEditor("demo");
    expect(host.openDefault).toHaveBeenCalledWith("/Users/me/Runyard/demo");
    await controller.openInEditor("missing");
    expect(host.openDefault).toHaveBeenCalledTimes(1);
  });

  it("界面发来形状不对的设置不执行，原样返回当前设置", async () => {
    const { controller, client } = setup();
    expect(await controller.set({ theme: "purple" })).toEqual(base);
    expect(client.call).not.toHaveBeenCalledWith("settings.set", expect.anything());
  });

  it("命令行或别处改了设置：管理进程发来变化，开着的设置页收到新值，系统外观也跟着变", async () => {
    const { controller, host, change } = setup();
    await controller.start();
    const seen: Settings[] = [];
    controller.onChange((settings) => seen.push(settings));
    change({ theme: "dark" });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.theme).toBe("dark");
    expect(host.setTheme).toHaveBeenCalledWith("dark");
  });
});
