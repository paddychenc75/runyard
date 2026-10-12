import { describe, expect, it } from "vitest";
import { checkLength } from "./check-length.ts";

const limit = { maxBytes: 1024 };
// 每段 100 个字符，拼出指定长度的路径
const pathOfLength = (bytes: number) => {
  const parts: string[] = [];
  let length = 0;
  while (length < bytes) {
    const part = "d".repeat(Math.min(100, bytes - length - 1) || 1);
    parts.push(part);
    length += part.length + 1;
  }
  return `/${parts.join("/")}`.slice(0, bytes);
};

describe("checkLength", () => {
  it("短路径是 ok", () => {
    expect(checkLength("/Users/me/Runyard/demo", limit)).toBe("ok");
  });

  it("到上限的八分之七是 near-limit，差一个字节还是 ok", () => {
    expect(checkLength(pathOfLength(895), limit)).toBe("ok");
    expect(checkLength(pathOfLength(896), limit)).toBe("near-limit");
  });

  it("到上限就是 too-long，差一个字节还是 near-limit", () => {
    expect(checkLength(pathOfLength(1023), limit)).toBe("near-limit");
    expect(checkLength(pathOfLength(1024), limit)).toBe("too-long");
  });

  it("单个名字超过 255 字节就是 too-long，哪怕整条路径很短", () => {
    expect(checkLength(`/tmp/${"x".repeat(256)}`, limit)).toBe("too-long");
    expect(checkLength(`/tmp/${"x".repeat(255)}`, limit)).toBe("ok");
  });

  it("按字节而不是字符计算", () => {
    // 80 个汉字 = 240 字节，没超过单个名字的 255 字节；86 个汉字 = 258 字节，超了
    expect(checkLength(`/tmp/${"字".repeat(80)}`, limit)).toBe("ok");
    expect(checkLength(`/tmp/${"字".repeat(86)}`, limit)).toBe("too-long");
  });
});
