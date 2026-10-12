import { describe, expect, it } from "vitest";
import {
  type ErrorCode,
  errorCodes,
  errorRegistry,
  isErrorCode,
  runyardErrorSchema,
} from "./errors.ts";

// 每个错误码一组：一份合法参数，一份非法参数
const cases: Record<ErrorCode, { ok: unknown; bad: unknown }> = {
  INTERNAL: { ok: {}, bad: undefined },
  USAGE: { ok: {}, bad: "x" },
  NAME_INVALID: { ok: { name: "a b" }, bad: {} },
  NAME_RESERVED: { ok: { name: "con" }, bad: { name: 1 } },
  VAR_INVALID: { ok: { key: "port" }, bad: { key: "" } },
  PLAYGROUND_NOT_FOUND: { ok: { name: "demo" }, bad: {} },
  TEMPLATE_NOT_FOUND: { ok: { template: "react19" }, bad: { name: "react19" } },
  FOLDER_MISSING: { ok: { name: "demo" }, bad: { name: null } },
  RUN_NOT_FOUND: { ok: { runId: "r_9" }, bad: { runId: "" } },
  TOOL_MISSING: { ok: { tool: "go", required: ">=1.26" }, bad: { tool: "go" } },
  TOOL_TOO_OLD: {
    ok: { tool: "go", required: ">=1.26", found: "1.20" },
    bad: { tool: "go", required: ">=1.26" },
  },
  RUNTIME_MISSING: { ok: { tool: "node" }, bad: {} },
  SETUP_FAILED: { ok: { name: "demo" }, bad: {} },
  DEPS_OFFLINE: { ok: { name: "demo" }, bad: {} },
  RUN_FAILED: { ok: { name: "demo" }, bad: {} },
  SCRIPT_ERRORED: { ok: { name: "demo" }, bad: {} },
  READY_TIMEOUT: { ok: { name: "demo", seconds: 60 }, bad: { name: "demo", seconds: "60" } },
  NAME_EXISTS: { ok: { name: "demo" }, bad: {} },
  BUSY: { ok: { name: "demo" }, bad: {} },
  PATH_LOCKED: { ok: { name: "demo" }, bad: {} },
  PATH_TOO_LONG: { ok: { name: "demo" }, bad: {} },
  TRASH_UNAVAILABLE: { ok: { name: "demo" }, bad: {} },
  APP_REQUIRED: { ok: {}, bad: null },
  SUPERVISOR_UNAVAILABLE: { ok: {}, bad: null },
  SUPERVISOR_OUTDATED: { ok: { runs: 2 }, bad: { runs: -1 } },
  CLIENT_OUTDATED: { ok: {}, bad: null },
  NOT_SUPPORTED: { ok: {}, bad: null },
  DATA_FROM_NEWER_VERSION: {
    ok: { file: "library.json", found: 3, supported: 2 },
    bad: { file: "library.json", found: 3 },
  },
};

// 技术设计 §5.3 的退出码表，逐字抄在这里；登记表必须与它一致
const exitTable: Record<number, ErrorCode[]> = {
  1: ["INTERNAL"],
  2: ["USAGE", "NAME_INVALID", "NAME_RESERVED", "VAR_INVALID"],
  3: ["PLAYGROUND_NOT_FOUND", "TEMPLATE_NOT_FOUND", "FOLDER_MISSING", "RUN_NOT_FOUND"],
  4: ["TOOL_MISSING", "TOOL_TOO_OLD", "RUNTIME_MISSING"],
  5: ["SETUP_FAILED", "DEPS_OFFLINE"],
  6: ["RUN_FAILED", "SCRIPT_ERRORED"],
  7: ["READY_TIMEOUT"],
  9: ["NAME_EXISTS", "BUSY", "PATH_LOCKED", "PATH_TOO_LONG", "TRASH_UNAVAILABLE"],
  10: [
    "APP_REQUIRED",
    "SUPERVISOR_UNAVAILABLE",
    "SUPERVISOR_OUTDATED",
    "CLIENT_OUTDATED",
    "NOT_SUPPORTED",
    "DATA_FROM_NEWER_VERSION",
  ],
};

// 已发布的错误码清单（含退出码）。只许新增，不许改名、改退出码或删除（规格 PROTOCOL-HANDSHAKE-18）
const released: Record<string, number> = Object.fromEntries(
  Object.entries(exitTable).flatMap(([exit, codes]) => codes.map((c) => [c, Number(exit)])),
);

describe("错误码登记表", () => {
  it("共 28 个错误码，没有重复", () => {
    expect(errorCodes).toHaveLength(28);
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
  });

  it("登记表覆盖了测试表里的每个错误码，一个不多一个不少", () => {
    expect([...errorCodes].sort()).toEqual(Object.keys(cases).sort());
  });

  it("退出码与技术设计 §5.3 的表逐项一致，且 0 和 8 不被占用", () => {
    for (const [exit, codes] of Object.entries(exitTable)) {
      for (const code of codes) expect(errorRegistry[code].exit).toBe(Number(exit));
    }
    const used = new Set(errorCodes.map((c) => errorRegistry[c].exit));
    expect(used.has(0 as never)).toBe(false);
    expect(used.has(8 as never)).toBe(false);
  });

  it.each(errorCodes)("%s：合法参数通过、非法参数被拒绝", (code) => {
    const { ok, bad } = cases[code];
    const base = { code, debug: "diagnostic" };
    expect(runyardErrorSchema.safeParse({ ...base, params: ok }).success).toBe(true);
    expect(runyardErrorSchema.safeParse({ ...base, params: bad }).success).toBe(false);
    expect(errorRegistry[code].params.safeParse(ok).success).toBe(true);
    expect(errorRegistry[code].params.safeParse(bad).success).toBe(false);
  });

  it("[PROTOCOL-HANDSHAKE-16] 登记表的参数定义里没有 message、hint 这类面向用户的字段", () => {
    const banned = ["message", "hint", "title", "body", "text"];
    for (const code of errorCodes) {
      const shape = (errorRegistry[code].params as unknown as { shape: Record<string, unknown> })
        .shape;
      for (const key of banned) expect(Object.keys(shape)).not.toContain(key);
      expect(Number.isInteger(errorRegistry[code].exit)).toBe(true);
    }
  });

  it("[PROTOCOL-HANDSHAKE-18] 已发布的错误码仍然存在，退出码不变", () => {
    for (const [code, exit] of Object.entries(released)) {
      expect(isErrorCode(code)).toBe(true);
      expect(errorRegistry[code as ErrorCode].exit).toBe(exit);
    }
  });

  it("DATA_FROM_NEWER_VERSION：文件种类必须是登记过的，版本号必须是正整数", () => {
    const params = errorRegistry.DATA_FROM_NEWER_VERSION.params;
    expect(params.safeParse({ file: "toolchain.json", found: 3, supported: 2 }).success).toBe(
      false,
    );
    expect(params.safeParse({ file: "cli.json", found: 0, supported: 2 }).success).toBe(false);
    expect(params.safeParse({ file: "cli.json", found: 2.5, supported: 2 }).success).toBe(false);
    expect(errorRegistry.DATA_FROM_NEWER_VERSION.exit).toBe(errorRegistry.CLIENT_OUTDATED.exit);
  });

  it("isErrorCode 不认原型链上的名字和未登记的代码", () => {
    expect(isErrorCode("toString")).toBe(false);
    expect(isErrorCode("SOMETHING_NEW")).toBe(false);
  });
});

describe("RunyardError", () => {
  it("[PROTOCOL-HANDSHAKE-15] 名称冲突的错误只有代码、参数、debug，没有面向用户的句子", () => {
    const error = { code: "NAME_EXISTS", params: { name: "demo" }, debug: "playground exists" };
    const parsed = runyardErrorSchema.parse(error);
    expect(parsed).toEqual(error);
    expect(Object.keys(parsed).sort()).toEqual(["code", "debug", "params"]);
  });

  it("code 与 params 必须对得上：用别的代码的参数会被拒绝", () => {
    const wrong = { code: "READY_TIMEOUT", params: { name: "demo" }, debug: "x" };
    expect(runyardErrorSchema.safeParse(wrong).success).toBe(false);
  });

  it("未登记的代码被拒绝（客户端对未知代码的兜底由 client 包负责）", () => {
    expect(
      runyardErrorSchema.safeParse({ code: "SOMETHING_NEW", params: {}, debug: "x" }).success,
    ).toBe(false);
  });

  it("缺少 debug 被拒绝；cause 可选，且只认三个字段的类型", () => {
    expect(runyardErrorSchema.safeParse({ code: "INTERNAL", params: {} }).success).toBe(false);
    const withCause = {
      code: "RUN_FAILED",
      params: { name: "demo" },
      debug: "exited before ready",
      cause: { exitCode: 1, signal: "SIGTERM", outputTail: "boom" },
    };
    expect(runyardErrorSchema.safeParse(withCause).success).toBe(true);
    expect(runyardErrorSchema.safeParse({ ...withCause, cause: { exitCode: "1" } }).success).toBe(
      false,
    );
  });

  it("[PROTOCOL-HANDSHAKE-20] 多出来的未知字段被忽略，不报错", () => {
    const parsed = runyardErrorSchema.parse({
      code: "USAGE",
      params: { extra: 1 },
      debug: "x",
      later: true,
    });
    expect(parsed).toEqual({ code: "USAGE", params: {}, debug: "x" });
  });
});
