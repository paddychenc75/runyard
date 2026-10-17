import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { detectBinaryArch, parseBinaryArch } from "./binary-arch.ts";

function thin(cpu: number): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, cpu, true);
  return bytes;
}

function fat(cpus: number[]): Uint8Array {
  const bytes = new Uint8Array(8 + 20 * cpus.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xcafebabe, false);
  view.setUint32(4, cpus.length, false);
  for (const [index, cpu] of cpus.entries()) view.setUint32(8 + index * 20, cpu, false);
  return bytes;
}

describe("可执行文件的芯片架构", () => {
  it("单一架构的 Mach-O 读出 arm64 或 x64", () => {
    expect(parseBinaryArch(thin(0x0100000c))).toBe("arm64");
    expect(parseBinaryArch(thin(0x01000007))).toBe("x64");
  });

  it("通用二进制两种都有是 universal，只有一种就是那一种", () => {
    expect(parseBinaryArch(fat([0x01000007, 0x0100000c]))).toBe("universal");
    expect(parseBinaryArch(fat([0x0100000c]))).toBe("arm64");
  });

  it("脚本、Java 的 class 文件、太短的内容读不出来", () => {
    expect(parseBinaryArch(new TextEncoder().encode("#!/bin/sh\necho hi\n"))).toBeUndefined();
    expect(parseBinaryArch(fat([52]))).toBeUndefined();
    expect(parseBinaryArch(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it("文件读不到时是 undefined，不抛错", async () => {
    const fs = { readHead: async () => null };
    expect(await detectBinaryArch(fs, absPath("/nope"))).toBeUndefined();
    const broken = {
      readHead: async () => {
        throw new Error("denied");
      },
    };
    expect(await detectBinaryArch(broken, absPath("/denied"))).toBeUndefined();
  });
});
