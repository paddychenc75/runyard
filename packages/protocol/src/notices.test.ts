import { describe, expect, it } from "vitest";
import { type NoticeCode, noticeCodes, noticeRegistry, noticeSchema } from "./notices.ts";

const cases: Record<NoticeCode, { ok: unknown; bad: unknown }> = {
  RELOADING: { ok: {}, bad: null },
  STOPPED_BY_USER: { ok: {}, bad: "x" },
  PROCESS_EXITED: { ok: { exitCode: 1 }, bad: { exitCode: 1.5 } },
  DEPS_FROM_CACHE: { ok: {}, bad: null },
  PORT_FALLBACK: {
    ok: { wanted: 7100, actual: 7101, reason: "PORT_OCCUPIED" },
    bad: { wanted: 7100, actual: 7101, reason: "OTHER" },
  },
  ENV_UNRESOLVED: { ok: { reason: "timeout" }, bad: { reason: "slow" } },
  ENV_DEGRADED: { ok: {}, bad: null },
  IDLE_STOPPED: { ok: { minutes: 30 }, bad: { minutes: 0 } },
  PACKAGE_MANAGER_FALLBACK: { ok: { wanted: "pnpm", used: "npm" }, bad: { wanted: "pnpm" } },
  PATH_NEAR_LIMIT: { ok: { length: 250, limit: 260 }, bad: { length: 250 } },
  TOOL_VERSION_UNTESTED: {
    ok: { tool: "node", found: "28.0.0", required: ">=24 <28" },
    bad: { tool: "node", found: "" },
  },
};

// 已发布的提示码清单，只许新增（规格 PROTOCOL-HANDSHAKE-18）
const released = [
  "RELOADING",
  "STOPPED_BY_USER",
  "PROCESS_EXITED",
  "DEPS_FROM_CACHE",
  "PORT_FALLBACK",
  "ENV_UNRESOLVED",
  "ENV_DEGRADED",
  "IDLE_STOPPED",
  "PACKAGE_MANAGER_FALLBACK",
  "PATH_NEAR_LIMIT",
  "TOOL_VERSION_UNTESTED",
];

describe("提示码登记表", () => {
  it("没有重复，且与测试表一一对应", () => {
    expect(new Set(noticeCodes).size).toBe(noticeCodes.length);
    expect([...noticeCodes].sort()).toEqual(Object.keys(cases).sort());
  });

  it("[PROTOCOL-HANDSHAKE-18] 已发布的提示码仍然存在", () => {
    for (const code of released) expect(noticeCodes).toContain(code);
  });

  it.each(noticeCodes)("%s：合法参数通过、非法参数被拒绝", (code) => {
    const { ok, bad } = cases[code];
    expect(noticeSchema.safeParse({ code, params: ok }).success).toBe(true);
    expect(noticeSchema.safeParse({ code, params: bad }).success).toBe(false);
  });

  it("[PROTOCOL-HANDSHAKE-16] 参数定义里没有面向用户的文字字段", () => {
    for (const code of noticeCodes) {
      const shape = (noticeRegistry[code].params as unknown as { shape: Record<string, unknown> })
        .shape;
      for (const key of ["message", "hint", "title", "body", "text"])
        expect(Object.keys(shape)).not.toContain(key);
    }
  });
});
