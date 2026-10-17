// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// 整个外壳加弹窗在慢机器上要一两秒才画出来，默认的 1 秒等待不够
const SLOW = { timeout: 8000 };
vi.setConfig({ testTimeout: 20_000 });
const user = userEvent.setup();

const react19 = { id: "react19", name: { en: "React 19", "zh-CN": "React 19 + TypeScript" } };
const confirm = {
  source: "docs.example.dev" as string | null,
  fromProject: null as string | null,
  template: { ...react19, name: react19.name },
  name: "react19-4",
  folder: "~/Runyard/react19-4",
};

function library(extra: Partial<LibraryState> = {}): LibraryState {
  return {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates: [],
    runs: [],
    loaded: true,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds: [],
    ...extra,
  };
}

function setup(state: LibraryState, locale: "zh-CN" | "en" = "zh-CN") {
  const calls: [string, unknown][] = [];
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push([method, param]);
    return method === "library.get" ? state : undefined;
  });
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale,
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const bridge = { bootstrap, call, on: () => () => {} } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale={locale} theme="light" />);
  return { calls };
}

const called = (calls: [string, unknown][], method: string) =>
  calls.filter(([name]) => name === method).length;

describe("runyard://new 的确认框", () => {
  it("[DESKTOP-LINKS-06] 写明自称的来源、模板、名称、文件夹和那段说明；默认按钮是取消；没有“信任来源”的选项", async () => {
    setup(library({ linkConfirm: confirm }));
    const dialog = await screen.findByRole("alertdialog", {}, SLOW);
    expect(within(dialog).getByText("要新建并运行这个项目吗？")).toBeTruthy();
    expect(within(dialog).getByText("来自一个链接")).toBeTruthy();
    const card = dialog.querySelector("[data-link-confirm]") as HTMLElement;
    expect(card.textContent).toContain("来源自称来自docs.example.dev");
    expect(card.textContent).toContain("React 19 + TypeScript");
    expect(card.textContent).toContain("react19-4");
    expect(card.textContent).toContain("~/Runyard/react19-4");
    expect(dialog.textContent).toContain(
      "这个来源是链接自己写的，Runyard 无法核实。新建后会安装依赖并运行模板里的代码，只在你信任它时继续。",
    );
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    const cancel = within(dialog).getByRole("button", { name: "取消" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(within(dialog).getByRole("button", { name: "新建并运行" })).toBeTruthy();
  });

  it("[DESKTOP-LINKS-07] 没带来源时写“未知来源”", async () => {
    setup(library({ linkConfirm: { ...confirm, source: null } }));
    const dialog = await screen.findByRole("alertdialog", {}, SLOW);
    expect(dialog.querySelector("[data-link-confirm]")?.textContent).toContain("未知来源");
    expect(dialog.textContent).not.toContain("自称来自");
  });

  it("[DESKTOP-LINKS-08] 直接按回车是取消：只发出取消，不发出确认", async () => {
    const { calls } = setup(library({ linkConfirm: confirm }));
    const dialog = await screen.findByRole("alertdialog", {}, SLOW);
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "取消" })),
    );
    await user.keyboard("{Enter}");
    expect(called(calls, "link.cancel")).toBe(1);
    expect(called(calls, "link.confirm")).toBe(0);
  });

  it("[DESKTOP-LINKS-08] Esc 也是取消", async () => {
    const { calls } = setup(library({ linkConfirm: confirm }));
    await screen.findByRole("alertdialog", {}, SLOW);
    await user.keyboard("{Escape}");
    expect(called(calls, "link.cancel")).toBe(1);
    expect(called(calls, "link.confirm")).toBe(0);
  });

  it("[DESKTOP-LINKS-09] 点“新建并运行”发出确认", async () => {
    const { calls } = setup(library({ linkConfirm: confirm }));
    await user.click(await screen.findByRole("button", { name: "新建并运行" }, SLOW));
    expect(called(calls, "link.confirm")).toBe(1);
    expect(called(calls, "link.cancel")).toBe(0);
  });

  it("[DESKTOP-LINKS-13] 来自预览页的请求另写“来自项目 docs-demo 的预览页”", async () => {
    setup(library({ linkConfirm: { ...confirm, fromProject: "docs-demo" } }));
    const dialog = await screen.findByRole("alertdialog", {}, SLOW);
    expect(dialog.textContent).toContain("来自项目 docs-demo 的预览页");
  });

  it("英文界面写英文的同一块内容", async () => {
    setup(library({ locale: "en", linkConfirm: confirm }), "en");
    const dialog = await screen.findByRole("alertdialog", {}, SLOW);
    expect(within(dialog).getByText("Create and run this playground?")).toBeTruthy();
    expect(dialog.textContent).toContain("Claims to be fromdocs.example.dev");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create and run" })).toBeTruthy();
  });

  it("没有待确认的请求时没有这个弹窗", async () => {
    setup(library());
    await screen.findByRole("heading", { level: 1 }, SLOW);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("链接没能照做的提示", () => {
  it("[DESKTOP-LINKS-03] 没有这个项目：窗口里写没有叫 nope 的项目", async () => {
    setup(
      library({ notices: [{ kind: "link", id: "link-1", code: "open-missing", value: "nope" }] }),
    );
    const region = await screen.findByRole("region", { name: "提示" }, SLOW);
    expect(region.textContent).toContain("没有叫 nope 的项目");
  });

  it("[DESKTOP-LINKS-04] 不合法的名称：写链接里的名称不合法", async () => {
    setup(
      library({ notices: [{ kind: "link", id: "link-1", code: "open-invalid", value: null }] }),
    );
    expect((await screen.findByRole("region", { name: "提示" }, SLOW)).textContent).toContain(
      "链接里的项目名称不合法",
    );
  });

  it("[DESKTOP-LINKS-10] 不存在的模板、[DESKTOP-LINKS-11] 名称被占用、[DESKTOP-LINKS-14] 已有待确认、[DESKTOP-LINKS-16] 太频繁，各写各的原因", async () => {
    setup(
      library({
        notices: [
          { kind: "link", id: "l1", code: "new-no-template", value: "rails" },
          { kind: "link", id: "l2", code: "new-name-taken", value: "landing" },
          { kind: "link", id: "l3", code: "new-busy", value: null },
          { kind: "link", id: "l4", code: "new-throttled", value: null },
        ],
      }),
    );
    const text = (await screen.findByRole("region", { name: "提示" }, SLOW)).textContent;
    expect(text).toContain("本机没有模板 rails");
    expect(text).toContain("名称 landing 已被占用");
    expect(text).toContain("已有一个待确认的新建请求");
    expect(text).toContain("新建得太频繁");
  });
});

describe("“有新版本”提示条", () => {
  const update = { latest: "0.3.0", current: "0.2.0" };

  it("[DESKTOP-SETTINGS-26] 资源库页顶部写新旧版本；“下载”请求打开发布页，“以后再说”收起", async () => {
    const { calls } = setup(library({ update }));
    const banner = await screen.findByRole("status", { name: "新版本" }, SLOW);
    expect(banner.textContent).toContain("Runyard 0.3.0 已发布，你现在用的是 0.2.0。");
    await user.click(within(banner).getByRole("button", { name: "下载" }));
    expect(called(calls, "update.download")).toBe(1);
    await user.click(within(banner).getByRole("button", { name: "以后再说" }));
    expect(called(calls, "update.later")).toBe(1);
  });

  it("[DESKTOP-SETTINGS-26] 英文界面", async () => {
    setup(library({ locale: "en", update }), "en");
    const banner = await screen.findByRole("status", { name: "New version" }, SLOW);
    expect(banner.textContent).toContain("Runyard 0.3.0 is out. You are using 0.2.0.");
    expect(within(banner).getByRole("button", { name: "Download" })).toBeTruthy();
    expect(within(banner).getByRole("button", { name: "Later" })).toBeTruthy();
  });

  it("没有新版本时没有提示条", async () => {
    setup(library({ update: null }));
    await screen.findByRole("heading", { level: 1 }, SLOW);
    expect(screen.queryByRole("status", { name: "新版本" })).toBeNull();
  });
});
