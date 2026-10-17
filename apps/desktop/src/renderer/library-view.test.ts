import { describe, expect, it } from "vitest";
import type { PlaygroundRow } from "../shared/library-state.ts";
import {
  creatorOf,
  monogramOf,
  pickLocalizedText,
  retentionOf,
  runningCount,
  stateLabelKey,
  statusMarkOf,
} from "./library-view.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

function row(extra: Partial<PlaygroundRow> = {}): PlaygroundRow {
  return {
    id: "a",
    name: "a",
    path: "/lib/a",
    kind: "server",
    state: "idle",
    active: false,
    previewing: false,
    busy: false,
    note: "",
    templateId: "html",
    templateName: null,
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW,
    lastOpenedAt: null,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

describe("statusMarkOf、stateLabelKey", () => {
  it("运行中和就绪是运行中，启动安装检查重载停止中是进行中，失败类是崩溃，其余是已停止", () => {
    expect(statusMarkOf("ready")).toBe("running");
    expect(statusMarkOf("running")).toBe("running");
    for (const state of ["checking", "installing", "starting", "reloading", "stopping"] as const)
      expect(statusMarkOf(state)).toBe("starting");
    for (const state of ["crashed", "errored", "failed"] as const)
      expect(statusMarkOf(state)).toBe("crashed");
    for (const state of ["stopped", "finished", "idle"] as const)
      expect(statusMarkOf(state)).toBe("stopped");
  });

  it("从没运行过和已停止显示同一句，就绪显示成运行中", () => {
    expect(stateLabelKey("idle")).toBe("runState.stopped");
    expect(stateLabelKey("ready")).toBe("runState.running");
    expect(stateLabelKey("crashed")).toBe("runState.crashed");
  });
});

describe("retentionOf", () => {
  it("关闭自动清理是已保留", () => {
    expect(retentionOf(row(), NOW)).toEqual({ kind: "kept" });
  });

  it("剩余天数 = 设定天数 - 距最近一次使用已满的天数，最少 0", () => {
    const temp = (usedDaysAgo: number) =>
      row({ autoClean: { enabled: true, days: 30 }, lastUsedAt: NOW - usedDaysAgo * DAY });
    expect(retentionOf(temp(0), NOW)).toEqual({ kind: "autoClean", daysLeft: 30 });
    expect(retentionOf(temp(18), NOW)).toEqual({ kind: "autoClean", daysLeft: 12 });
    expect(retentionOf(temp(18.9), NOW)).toEqual({ kind: "autoClean", daysLeft: 12 });
    expect(retentionOf(temp(45), NOW)).toEqual({ kind: "autoClean", daysLeft: 0 });
  });

  it("协议没给天数时不瞎猜", () => {
    expect(retentionOf(row({ autoClean: { enabled: true, days: null } }), NOW)).toEqual({
      kind: "autoCleanUnknown",
    });
  });
});

describe("monogramOf", () => {
  it("带连字符取各段首字母，否则首字母大写加第二个字母小写", () => {
    expect(monogramOf("node-ts")).toBe("NT");
    expect(monogramOf("react19")).toBe("Re");
    expect(monogramOf("hono")).toBe("Ho");
    expect(monogramOf("go")).toBe("Go");
    expect(monogramOf("vue3")).toBe("Vu");
  });
});

describe("creatorOf", () => {
  it("用户是我，智能体带名字，命令行没有智能体名字时是命令行", () => {
    expect(creatorOf(row())).toEqual({ kind: "me" });
    expect(creatorOf(row({ createdBy: { kind: "agent", agent: "Claude Code" } }))).toEqual({
      kind: "agent",
      name: "Claude Code",
    });
    expect(creatorOf(row({ createdBy: { kind: "agent" } }))).toEqual({ kind: "agent", name: null });
    expect(creatorOf(row({ createdBy: { kind: "cli" } }))).toEqual({ kind: "cli" });
    expect(creatorOf(row({ createdBy: { kind: "cli", agent: "Codex" } }))).toEqual({
      kind: "agent",
      name: "Codex",
    });
  });
});

describe("其余", () => {
  it("运行中的数量只数进行中的", () => {
    expect(runningCount([row({ active: true }), row(), row({ active: true })])).toBe(2);
  });

  it("本地化名字按语言取，缺这个语言时退回英文", () => {
    expect(pickLocalizedText({ en: "A", "zh-CN": "甲" }, "zh-CN")).toBe("甲");
    expect(pickLocalizedText({ en: "A" }, "zh-CN")).toBe("A");
    expect(pickLocalizedText("plain", "en")).toBe("plain");
  });
});
