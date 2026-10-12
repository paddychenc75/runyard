import { describe, expect, it } from "vitest";
import { encodeLogLine, parseLogLine } from "./log-line.ts";

describe("日志行", () => {
  it("进程输出原样往返：颜色码、回车、BOM 都不被清洗", () => {
    const line = {
      seq: 0,
      at: 1_760_000_000_000,
      kind: "stdout",
      text: "\uFEFF\x1b[32mok\x1b[0m\r",
    } as const;
    const encoded = encodeLogLine(line);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(encoded.slice(0, -1)).not.toContain("\n");
    expect(parseLogLine(encoded.slice(0, -1))).toEqual({ ok: true, line });
  });

  it("文本里的换行被转义，一条日志永远只占一行", () => {
    const encoded = encodeLogLine({ seq: 1, at: 1, kind: "stderr", text: "a\nb" });
    expect(encoded.indexOf("\n")).toBe(encoded.length - 1);
  });

  it("管理进程插入的提示是代码加参数，不是句子", () => {
    const line = {
      seq: 2,
      at: 5,
      kind: "system",
      notice: {
        code: "PORT_FALLBACK",
        params: { wanted: 7100, actual: 7101, reason: "PORT_OCCUPIED" },
      },
    } as const;
    expect(parseLogLine(encodeLogLine(line).trim())).toEqual({ ok: true, line });
  });

  it("命令回显（command）也是一种行", () => {
    const line = { seq: 3, at: 5, kind: "command", text: "pnpm dev" } as const;
    expect(parseLogLine(encodeLogLine(line).trim())).toEqual({ ok: true, line });
  });

  it.each([
    ["崩溃时只写了一半的行", '{"seq":4,"at":1,"kind":"std'],
    ["不是对象", "42"],
    ["缺序号", '{"at":1,"kind":"stdout","text":"x"}'],
    ["序号是负数", '{"seq":-1,"at":1,"kind":"stdout","text":"x"}'],
    ["种类未知", '{"seq":1,"at":1,"kind":"other","text":"x"}'],
    ["空行", ""],
  ])("坏行不是错误，返回 ok: false 让调用方跳过：%s", (_title, text) => {
    expect(parseLogLine(text)).toEqual({ ok: false });
  });

  it("写出时形状不合法的行被拒绝", () => {
    expect(() => encodeLogLine({ seq: -1, at: 1, kind: "stdout", text: "x" })).toThrow();
  });
});
