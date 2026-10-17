import { describe, expect, it } from "vitest";
import { terminalMethods } from "./terminal-ipc.ts";
import type { TerminalService } from "./terminal-service.ts";

// 页面发来的数据不可信：形状不对一律不调用服务
function fakeService() {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return { state: { kind: "none" }, output: "" };
    };
  const service = {
    open: record("open"),
    attach: record("attach"),
    detach: (...args: unknown[]) => void calls.push(["detach", ...args]),
    write: (...args: unknown[]) => void calls.push(["write", ...args]),
    resize: (...args: unknown[]) => void calls.push(["resize", ...args]),
    ack: (...args: unknown[]) => void calls.push(["ack", ...args]),
    clear: (...args: unknown[]) => void calls.push(["clear", ...args]),
    reopen: record("reopen"),
    foreground: async () => ({ command: null }),
  } as unknown as TerminalService;
  return { methods: terminalMethods(service), calls };
}

describe("终端的界面消息", () => {
  it("格式对的消息交给服务", async () => {
    const { methods, calls } = fakeService();
    await methods["terminal.open"]({ project: "demo", cols: 80, rows: 24 });
    methods["terminal.write"]({ project: "demo", data: "ls\r" });
    methods["terminal.resize"]({ project: "demo", cols: 100, rows: 30 });
    methods["terminal.ack"]({ project: "demo", length: 5 });
    methods["terminal.detach"]({ project: "demo" });
    expect(calls).toEqual([
      ["open", "demo", { cols: 80, rows: 24 }],
      ["write", "demo", "ls\r"],
      ["resize", "demo", { cols: 100, rows: 30 }],
      ["ack", "demo", 5],
      ["detach", "demo"],
    ]);
  });

  it("形状不对一律不调用服务：没有项目、大小不是正整数、写入不是文字", async () => {
    const { methods, calls } = fakeService();
    await methods["terminal.open"]({ project: "", cols: 80, rows: 24 });
    await methods["terminal.open"]({ project: "demo", cols: 0, rows: 24 });
    await methods["terminal.open"]({ project: "demo", cols: 80.5, rows: 24 });
    await methods["terminal.reopen"](null);
    methods["terminal.write"]({ project: "demo", data: 5 });
    methods["terminal.resize"]({ project: "demo", cols: -1, rows: 24 });
    methods["terminal.ack"]({ project: "demo", length: "9" });
    methods["terminal.clear"]("demo");
    expect(calls).toEqual([]);
  });

  it("没接线（没有服务）时不崩：当作没有终端", async () => {
    const methods = terminalMethods(undefined);
    expect(await methods["terminal.open"]({ project: "", cols: 80, rows: 24 })).toEqual({
      state: { kind: "none" },
      output: "",
    });
    expect(() => methods["terminal.write"]({ project: "demo", data: "x" })).toThrow();
  });
});
