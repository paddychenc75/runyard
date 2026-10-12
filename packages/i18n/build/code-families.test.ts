import { readFileSync } from "node:fs";
import { join } from "node:path";
import { errorRegistry, noticeRegistry, runStates } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { codeEntries, codeKeyPrefixes, errorMessageFields } from "./code-families.ts";

describe("代码派生的键族", () => {
  const entries = codeEntries({ errors: errorRegistry, notices: noticeRegistry, runStates });

  it("键数量等于登记表推出的数量，每个键都在声明的前缀下", () => {
    const expected =
      Object.keys(errorRegistry).length * errorMessageFields.length +
      Object.keys(noticeRegistry).length +
      runStates.length;
    expect(entries).toHaveLength(expected);
    for (const entry of entries) {
      expect(codeKeyPrefixes.some((prefix) => entry.key.startsWith(prefix))).toBe(true);
    }
  });

  it("读出可选参数和枚举取值（PROCESS_EXITED、PORT_FALLBACK）", () => {
    const exited = entries.find((entry) => entry.key === "notice.PROCESS_EXITED");
    expect(exited?.params.exitCode?.optional).toBe(true);
    expect(exited?.params.signal?.optional).toBe(true);
    const port = entries.find((entry) => entry.key === "notice.PORT_FALLBACK");
    expect(port?.params.reason?.values).toEqual(["PORT_OCCUPIED", "PORT_RESERVED"]);
    expect(port?.params.wanted?.optional).toBe(false);
  });

  it("错误码的四个字段和 src/messages.ts 的 ErrorMessageField 一致", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "messages.ts"), "utf8");
    const declared = /ErrorMessageField = ([^;]+);/.exec(source)?.[1] ?? "";
    const names = [...declared.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...errorMessageFields]);
  });
});
