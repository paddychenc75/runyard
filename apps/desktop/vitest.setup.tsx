import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BootstrapInfo, DesktopBridge } from "./src/shared/desktop-bridge.ts";
import type { LibraryState } from "./src/shared/library-state.ts";

// jsdom 没有 getAnimations；Base UI 的滚动区在滚动停下的计时器里会调用它，缺了就是一个未捕获的异常
if (typeof Element !== "undefined") {
  const proto = Element.prototype as { getAnimations?: () => unknown[] };
  proto.getAnimations ??= () => [];
}

// 每个界面测试文件在自己的用例开始前，先把外壳整个画一遍、做一次角色查询。
//
// 为什么：一个文件里第一次画外壳、第一次角色查询要付一次冷启动的代价（加载、即时编译、
// jsdom 的样式计算）。本机约 0.1 秒，慢的 CI 虚拟机上被拖慢几十倍，全落在该文件的第一个用例里，
// 逼近 5 秒上限而偶发超时（#219 资源库页、#234 外壳和失败画面）。
// 在这里（装载阶段，不属于任何用例的时限）付掉这笔代价，用例的断言和时限都不变。
//
// 弹窗路径也要热身：新建弹窗的 FLOW-06 / FLOW-08 在 windows-2025 上超时（#277），原因是模板选择器、
// 基于 Base UI 的对话框、开关、输入框和 userEvent 的输入链路第一次用到时也要冷启动，
// 而热身只画了资源库页，这笔钱落在 CreateDialog 文件的头几个用例里。
//
// 只对 jsdom 环境的文件做；纯逻辑的测试文件没有 document，不付这笔钱。
if (typeof document !== "undefined") {
  const { AppFrame } = await import("./src/renderer/app/AppFrame.tsx");

  const state: LibraryState = {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates: [
      {
        id: "react19",
        name: { en: "React 19", "zh-CN": "React 19" },
        description: "warmup",
        category: "frontend",
        unmaintained: false,
      },
    ],
    recentTemplates: [],
    libraryRoot: "~/Runyard",
    tabs: [],
    activeTab: "library",
    playgrounds: [
      {
        id: "warmup",
        name: "warmup",
        path: "/warmup",
        kind: "server",
        state: "ready",
        active: true,
        previewing: false,
        busy: false,
        note: "",
        templateId: "react19",
        templateName: { en: "React 19", "zh-CN": "React 19" },
        port: 7100,
        autoClean: { enabled: false, days: null },
        lastUsedAt: 1,
        lastOpenedAt: 1,
        createdBy: { kind: "user" },
        createdAt: 1,
      },
    ],
  };
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale: "zh-CN",
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const listeners = new Map<string, () => void>();
  const bridge = {
    bootstrap,
    call: async (method: string) => (method === "library.get" ? state : undefined),
    on: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return () => {};
    },
  } as unknown as DesktopBridge;

  // 预览占位区要 ResizeObserver，Base UI 的滚动区要 getAnimations，jsdom 都没有。
  // 只在热身期间借用，用完还原，不替各个测试文件决定它们自己的替身
  const target = globalThis as { ResizeObserver?: unknown };
  const proto = Element.prototype as { getAnimations?: () => unknown[] };
  const savedObserver = target.ResizeObserver;
  const savedAnimations = proto.getAnimations;
  target.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  proto.getAnimations = () => [];
  try {
    render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
    within(await screen.findByRole("table", { name: /项目列表|Playgrounds/ })).getAllByRole("row");
    screen.getAllByRole("tab");

    // 再走一遍「选择器 -> 新建弹窗 -> 开关 -> 输入 -> 回车」，把弹窗路径的冷启动也付掉
    const user = userEvent.setup();
    act(() => listeners.get("picker.open")?.());
    await user.click(await screen.findByRole("option", { name: /React 19/ }));
    const dialog = await screen.findByRole("dialog", { name: "新建项目" });
    await user.click(within(dialog).getByRole("switch", { name: "自动清理" }));
    await user.type(within(dialog).getByRole("textbox", { name: /备注/ }), "warmup");
  } finally {
    cleanup();
    if (savedObserver === undefined) delete target.ResizeObserver;
    else target.ResizeObserver = savedObserver;
    if (savedAnimations === undefined) delete proto.getAnimations;
    else proto.getAnimations = savedAnimations;
    // 热身可能改了 <html> 的属性（lang、data-theme）和标题；还原，不让它漏进第一个用例
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("data-theme");
    document.title = "";
  }
}
