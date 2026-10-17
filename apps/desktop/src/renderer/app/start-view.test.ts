import { describe, expect, it } from "vitest";
import type { ConsoleLine } from "../../shared/console-state.ts";
import { lastOutputLine, secondsWithTenths, startStatusesOf } from "./start-view.ts";

const line = (seq: number, entry: ConsoleLine["entry"]): ConsoleLine => ({ seq, entry });

describe("启动清单的纯判断", () => {
  it("[DESKTOP-CREATE-FLOW-14] 每个启动阶段的状态对应一份清单，就绪后全部完成", () => {
    expect(startStatusesOf("installing")).toEqual({
      copy: "done",
      install: "current",
      start: "pending",
      ready: "pending",
    });
    expect(startStatusesOf("starting").start).toBe("current");
    expect(Object.values(startStatusesOf("ready"))).toEqual(["done", "done", "done", "done"]);
  });

  it("[DESKTOP-CREATE-FLOW-14] 日志摘要取最近一行进程输出或命令，跳过管理进程的提示和空行", () => {
    expect(lastOutputLine([])).toBeNull();
    expect(
      lastOutputLine([
        line(1, { at: 1, kind: "command", text: "pnpm vite" }),
        line(2, { at: 2, kind: "stderr", text: "warn" }),
        line(3, { at: 3, kind: "stdout", text: "  " }),
        line(4, { at: 4, kind: "system", notice: { code: "RUN_STARTED", params: {} } } as never),
      ]),
    ).toBe("warn");
    expect(lastOutputLine([line(1, { at: 1, kind: "command", text: "pnpm vite" })])).toBe(
      "$ pnpm vite",
    );
  });

  it("用时按一位小数的秒数显示", () => {
    expect(secondsWithTenths(140)).toBe(0.1);
    expect(secondsWithTenths(2_460)).toBe(2.5);
    expect(secondsWithTenths(-5)).toBe(0);
  });
});
