import type { Localized } from "@runyard/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";

// jsdom 没有 getAnimations；Base UI 的滚动区在滚动停下的计时器里会调用它，缺了就是一个未捕获的异常
if (typeof Element !== "undefined") {
  const proto = Element.prototype as { getAnimations?: () => unknown[] };
  proto.getAnimations ??= () => [];
}

// 没开 Vitest 的全局变量，Testing Library 就不会自己在每个测试后卸载组件，这里补上
afterEach(() => {
  cleanup();
});

// 每个测试文件在自己的用例开始前，先把一个警示对话框完整走一遍（#270）。
//
// 为什么：Base UI 的对话框（portal、焦点陷阱、动画帧里的焦点移动）、勾选框和 userEvent 的点击链路，
// 第一次用到时要付一次冷启动的代价（加载、即时编译、jsdom 样式计算）。本机几十毫秒，
// 慢的 CI 虚拟机上被拖慢几十倍，全落在各文件的第一个对话框用例里，逼近 5 秒上限而偶发超时
// （#235 AlertDialog、#270 ConfirmDialog）。在装载阶段（不属于任何用例的时限）付掉，用例的断言和时限都不变。
// 只对 jsdom 环境的文件做；workbench 里读文件的测试跑在 Node 环境，没有 document。
if (typeof document !== "undefined") {
  const text = (value: string) => value as Localized;
  const { ConfirmDialog } = await import("./src/patterns/ConfirmDialog/ConfirmDialog.tsx");
  render(
    <ConfirmDialog
      open
      title={text("warmup")}
      description={text("warmup")}
      icon="stop"
      cancelLabel={text("Cancel")}
      confirmLabel={text("Confirm")}
      optOut={{ label: text("Opt out"), hint: text("hint") }}
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  await screen.findByRole("alertdialog", { name: "warmup" });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name: "Opt out" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  cleanup();
  document.documentElement.removeAttribute("style");
  document.title = "";
}
