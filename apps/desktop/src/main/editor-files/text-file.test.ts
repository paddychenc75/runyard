import { describe, expect, it } from "vitest";
import { applyLineEnding, decodeText, detectLineEnding } from "./text-file.ts";

describe("文本判定与换行符", () => {
  it("合法的 UTF-8 是文本，含 NUL 或非法字节序列的不是", () => {
    expect(decodeText(new TextEncoder().encode("你好\n"))).toBe("你好\n");
    expect(decodeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toBeNull();
    expect(decodeText(new Uint8Array([0x61, 0xff, 0xfe]))).toBeNull();
  });

  it("开头的 BOM 保留在内容里，写回时不丢", () => {
    const text = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]));
    expect(text).toBe("﻿a");
  });

  it("识别 lf、crlf、混用和没有换行", () => {
    expect(detectLineEnding("a\nb\n")).toBe("lf");
    expect(detectLineEnding("a\r\nb")).toBe("crlf");
    expect(detectLineEnding("a\r\nb\nc")).toBe("mixed");
    expect(detectLineEnding("abc")).toBe("none");
    expect(detectLineEnding("")).toBe("none");
  });

  it("统一换行：目标 crlf 不会把 CRLF 变成 CRCRLF，单独的 CR 不动，不指定就原样", () => {
    expect(applyLineEnding("a\nb\r\nc", "crlf")).toBe("a\r\nb\r\nc");
    expect(applyLineEnding("a\r\nb\nc", "lf")).toBe("a\nb\nc");
    expect(applyLineEnding("a\rb\n", "crlf")).toBe("a\rb\r\n");
    expect(applyLineEnding("a\r\nb\nc", undefined)).toBe("a\r\nb\nc");
  });
});
