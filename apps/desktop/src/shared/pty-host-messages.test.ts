import { describe, expect, it } from "vitest";
import { parseHostCommand } from "./pty-host-messages.ts";

describe("pty-host 收到的命令", () => {
  it("格式对的命令原样解析；open 里不是字符串的环境变量被丢掉", () => {
    expect(
      parseHostCommand({
        type: "open",
        project: "demo",
        cwd: "/lib/demo",
        cols: 80,
        rows: 24,
        env: { A: "1", B: 2 },
        marker: "m1",
      }),
    ).toEqual({
      type: "open",
      project: "demo",
      cwd: "/lib/demo",
      cols: 80,
      rows: 24,
      env: { A: "1" },
      marker: "m1",
    });
    expect(parseHostCommand({ type: "write", project: "demo", data: "ls\r" })).toEqual({
      type: "write",
      project: "demo",
      data: "ls\r",
    });
    expect(parseHostCommand({ type: "end", project: "demo", id: 3 })).toEqual({
      type: "end",
      project: "demo",
      id: 3,
    });
  });

  it("形状不对一律不要：没有项目、没有标记、未知类型、大小不是正整数、回执为负", () => {
    for (const bad of [
      null,
      "open",
      { type: "open", cwd: "/x", cols: 80, rows: 24, env: {}, marker: "m" },
      { type: "nope", project: "demo" },
      { type: "open", project: "demo", cwd: "/x", cols: 0, rows: 24, env: {}, marker: "m" },
      { type: "open", project: "demo", cwd: "/x", cols: 80.5, rows: 24, env: {}, marker: "m" },
      { type: "open", project: "demo", cwd: "/x", cols: 80, rows: 24, env: {} },
      { type: "open", project: "demo", cwd: "/x", cols: 80, rows: 24, env: {}, marker: "" },
      { type: "resize", project: "demo", cols: 80, rows: -1 },
      { type: "ack", project: "demo", length: -5 },
      { type: "write", project: "demo", data: 5 },
      { type: "end", project: "demo", id: "x" },
    ]) {
      expect(parseHostCommand(bad)).toBeNull();
    }
  });
});
