import { cleanup, render, screen, within } from "@testing-library/react";
import type { BootstrapInfo, DesktopBridge } from "./src/shared/desktop-bridge.ts";
import type { LibraryState } from "./src/shared/library-state.ts";

// 每个界面测试文件在自己的用例开始前，先把外壳整个画一遍、做一次角色查询。
//
// 为什么：一个文件里第一次画外壳、第一次角色查询要付一次冷启动的代价（加载、即时编译、
// jsdom 的样式计算）。本机约 0.1 秒，慢的 CI 虚拟机上被拖慢几十倍，全落在该文件的第一个用例里，
// 逼近 5 秒上限而偶发超时（#219 资源库页、#234 外壳和失败画面）。
// 在这里（装载阶段，不属于任何用例的时限）付掉这笔代价，用例的断言和时限都不变。
//
// 只对 jsdom 环境的文件做；纯逻辑的测试文件没有 document，不付这笔钱。
if (typeof document !== "undefined") {
  const { AppFrame } = await import("./src/renderer/app/AppFrame.tsx");

  const state: LibraryState = {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates: [],
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
  const bridge = {
    bootstrap,
    call: async (method: string) => (method === "library.get" ? state : undefined),
    on: () => () => {},
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
