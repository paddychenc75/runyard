import { describe, expect, it } from "vitest";
import { checkEntryName } from "./entry-name.ts";

describe("checkEntryName", () => {
  it("[DESKTOP-EDITOR-08] 空名字、只有空白、含斜杠、点和两个点都不可用，并给出原因", () => {
    expect(checkEntryName("")).toBe("empty");
    expect(checkEntryName("   ")).toBe("empty");
    expect(checkEntryName("a/b")).toBe("separator");
    expect(checkEntryName("a\\b")).toBe("separator");
    expect(checkEntryName(".")).toBe("dot");
    expect(checkEntryName("..")).toBe("dot");
  });

  it("控制字符和超过 255 字节的名字不可用，普通名字（含点开头、中文、空格）可用", () => {
    expect(checkEntryName("a\0b")).toBe("control");
    expect(checkEntryName("x".repeat(256))).toBe("too-long");
    expect(checkEntryName("文".repeat(86))).toBe("too-long");
    for (const ok of ["utils.ts", ".env", "..hidden", "我的 文件.md", "x".repeat(255)]) {
      expect(checkEntryName(ok)).toBeNull();
    }
  });
});
