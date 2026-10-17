// jsdom 里跑真的 Monaco 需要补的几样东西（只在测试里导入）：CSS.escape、matchMedia、画布，
// 以及不要真的排渲染帧（没有版面，渲染只会报错）。语言服务线程起不来，所以智能提示的场景不在这里测。

export function installMonacoTestEnv(): void {
  const target = globalThis as unknown as Record<string, unknown>;
  target.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // 后台线程起不来：给一个永远不回话的假线程，Monaco 的异步功能就一直等着，而不是抛“没有 Worker”
  target.Worker = class {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  };
  target.CSS = { escape: (value: string) => value, supports: () => false };
  window.matchMedia ??= ((query: string) => ({
    media: query,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
