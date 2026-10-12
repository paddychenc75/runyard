import { describe, expect, it } from "vitest";
import { createUlid } from "./create-ulid.ts";

describe("createUlid", () => {
  it("26 个 Crockford 字符，时间部分已知值可复现", () => {
    const id = createUlid(0, new Uint8Array(10));
    expect(id).toBe("00000000000000000000000000");
    expect(createUlid(1_700_000_000_000, new Uint8Array(10).fill(255))).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{26}$/,
    );
    expect(createUlid(32, new Uint8Array(10)).slice(0, 10)).toBe("0000000010");
  });

  it("时间靠后的字典序靠后；随机部分用满 80 位", () => {
    const a = createUlid(1_000, new Uint8Array(10));
    const b = createUlid(2_000, new Uint8Array(10));
    expect(a < b).toBe(true);
    expect(createUlid(0, new Uint8Array(10).fill(255)).slice(10)).toBe("ZZZZZZZZZZZZZZZZ");
  });

  it("时间越界和随机数太短是缺陷", () => {
    expect(() => createUlid(-1, new Uint8Array(10))).toThrow(RangeError);
    expect(() => createUlid(0, new Uint8Array(9))).toThrow(RangeError);
  });
});
