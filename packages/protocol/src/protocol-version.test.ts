import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, protocolVersionSchema } from "./protocol-version.ts";

describe("协议版本号", () => {
  it("协议版本号是通过校验的正整数", () => {
    expect(protocolVersionSchema.parse(PROTOCOL_VERSION)).toBe(PROTOCOL_VERSION);
  });

  it("拒绝 0 和小数", () => {
    expect(protocolVersionSchema.safeParse(0).success).toBe(false);
    expect(protocolVersionSchema.safeParse(1.5).success).toBe(false);
  });
});
