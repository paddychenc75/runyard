import { describe, expect, it } from "vitest";
import { formatMessage } from "./message-format.ts";

const EXITED =
  "exited{code, select, none {} other { with {code}}}{signal, select, none {} other { by {signal}}}.";

describe("formatMessage 的可选参数约定", () => {
  it("select 有 none 分支、参数没传时自动传 none，不抛错", () => {
    expect(formatMessage("en", EXITED, {})).toBe("exited.");
    expect(formatMessage("en", EXITED, { code: 1 })).toBe("exited with 1.");
    expect(formatMessage("en", EXITED, { code: 0, signal: "SIGKILL" })).toBe(
      "exited with 0 by SIGKILL.",
    );
  });

  it("没有 none 分支的参数漏传照样抛错，不会被悄悄吞掉", () => {
    expect(() => formatMessage("en", "hello {name}", {})).toThrow();
    expect(() => formatMessage("en", "{kind, select, a {A} other {B}}", {})).toThrow();
    expect(() => formatMessage("en", "{n, plural, other {#}}", {})).toThrow();
  });

  it("嵌在复数分支里的可选参数也认", () => {
    const message = "{n, plural, other {# 项{extra, select, none {} other {，含 {extra}}}}}";
    expect(formatMessage("zh-CN", message, { n: 2 })).toBe("2 项");
    expect(formatMessage("zh-CN", message, { n: 2, extra: "x" })).toBe("2 项，含 x");
  });
});
