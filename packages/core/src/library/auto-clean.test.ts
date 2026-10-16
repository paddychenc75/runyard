import { describe, expect, it } from "vitest";
import { type AutoCleanCandidate, DAY_MS, dueAt, judgeAutoClean } from "./auto-clean.ts";

const NOW = 1_000 * DAY_MS;
const H = 60 * 60 * 1000;
const none: ReadonlySet<string> = new Set();

function candidate(over: Partial<AutoCleanCandidate> = {}): AutoCleanCandidate {
  return {
    id: "p1",
    autoClean: { enabled: true, days: 30 },
    lastUsedAt: NOW - 10 * DAY_MS,
    ...over,
  };
}

const judge = (
  candidates: AutoCleanCandidate[],
  opts: { inUse?: ReadonlySet<string>; rootPresent?: boolean; now?: number } = {},
) =>
  judgeAutoClean({
    now: opts.now ?? NOW,
    rootPresent: opts.rootPresent ?? true,
    candidates,
    inUse: opts.inUse ?? none,
  });

type Row = {
  title: string;
  candidate: Partial<AutoCleanCandidate>;
  expected: "none" | "remind" | "clean";
};

// 30 天的项目，上次使用 lastUsed 之前；表里每行一条规则
const rows: Row[] = [
  {
    title: "[LIBRARY-AUTO-CLEAN-06] 已保留的项目，400 天没用，两份清单都没有",
    candidate: { autoClean: { enabled: false }, lastUsedAt: NOW - 400 * DAY_MS },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-06] 已保留且带着提醒记录也不清理",
    candidate: {
      autoClean: { enabled: false, days: 30 },
      lastUsedAt: NOW - 400 * DAY_MS,
      remindedAt: NOW - 5 * DAY_MS,
    },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-15] 29 天零 1 小时前用的：进入待提醒",
    candidate: { lastUsedAt: NOW - 29 * DAY_MS - H },
    expected: "remind",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-15] 28 天前用的：不在待提醒里",
    candidate: { lastUsedAt: NOW - 28 * DAY_MS },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-15] 离到期恰好 24 小时：还不提醒（不足 24 小时才算）",
    candidate: { lastUsedAt: NOW - 29 * DAY_MS },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-17] 提醒已显示后不再进入待提醒清单",
    candidate: { lastUsedAt: NOW - 29 * DAY_MS - H, remindedAt: NOW - H },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-20] 已到期，提醒 23 小时前显示：不可清理",
    candidate: { lastUsedAt: NOW - 31 * DAY_MS, remindedAt: NOW - 23 * H },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-21] 已到期，提醒 24 小时前显示：可清理",
    candidate: { lastUsedAt: NOW - 31 * DAY_MS, remindedAt: NOW - 24 * H },
    expected: "clean",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-21] 提醒显示满一天但还没到期：不可清理",
    candidate: { lastUsedAt: NOW - 29 * DAY_MS, remindedAt: NOW - 2 * DAY_MS },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-22] 应用很久没开、没有提醒记录：先提醒，不直接清理",
    candidate: { autoClean: { enabled: true, days: 7 }, lastUsedAt: NOW - 60 * DAY_MS },
    expected: "remind",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-27] 顺延期内（snoozedUntil 在将来）不可清理",
    candidate: {
      lastUsedAt: NOW - 31 * DAY_MS,
      remindedAt: NOW - 2 * DAY_MS,
      snoozedUntil: NOW + H,
    },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-27] 顺延期刚好结束：可清理",
    candidate: {
      lastUsedAt: NOW - 31 * DAY_MS,
      remindedAt: NOW - 2 * DAY_MS,
      snoozedUntil: NOW,
    },
    expected: "clean",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-28] 找不到文件夹的项目不提醒",
    candidate: { lastUsedAt: NOW - 29 * DAY_MS - H, missingSince: NOW - DAY_MS },
    expected: "none",
  },
  {
    title: "[LIBRARY-AUTO-CLEAN-28] 找不到文件夹的项目不清理",
    candidate: {
      lastUsedAt: NOW - 31 * DAY_MS,
      remindedAt: NOW - 2 * DAY_MS,
      missingSince: NOW - DAY_MS,
    },
    expected: "none",
  },
  {
    title: "开了自动清理但天数不合法：当作已保留",
    candidate: { autoClean: { enabled: true, days: 0 }, lastUsedAt: NOW - 400 * DAY_MS },
    expected: "none",
  },
];

describe("自动清理的判断", () => {
  for (const row of rows) {
    it(row.title, () => {
      const verdict = judge([candidate(row.candidate)]);
      expect({
        remind: verdict.remind,
        clean: verdict.clean,
      }).toEqual({
        remind: row.expected === "remind" ? ["p1"] : [],
        clean: row.expected === "clean" ? ["p1"] : [],
      });
      expect(verdict.postponed).toEqual([]);
    });
  }

  it("到期时间 = 上次使用 + 天数；已保留没有到期时间", () => {
    expect(dueAt(candidate({ autoClean: { enabled: true, days: 7 }, lastUsedAt: 1000 }))).toBe(
      1000 + 7 * DAY_MS,
    );
    expect(dueAt(candidate({ autoClean: { enabled: false } }))).toBeNull();
  });

  const ready = candidate({ lastUsedAt: NOW - 31 * DAY_MS, remindedAt: NOW - 2 * DAY_MS });

  it("[LIBRARY-AUTO-CLEAN-25] 正在使用的项目不可清理，顺延到一天之后", () => {
    const verdict = judge([ready], { inUse: new Set(["p1"]) });
    expect(verdict.clean).toEqual([]);
    expect(verdict.postponed).toEqual([{ id: "p1", until: NOW + DAY_MS }]);
  });

  it("[LIBRARY-AUTO-CLEAN-26] 有标签页开着也算使用（标签页即持有的运行）：顺延，不改变提醒", () => {
    const needsRemind = candidate({ id: "p2", lastUsedAt: NOW - 29 * DAY_MS - H });
    const verdict = judge([ready, needsRemind], { inUse: new Set(["p1", "p2"]) });
    expect(verdict.clean).toEqual([]);
    expect(verdict.postponed.map((p) => p.id)).toEqual(["p1"]);
    expect(verdict.remind).toEqual(["p2"]);
  });

  it("[LIBRARY-AUTO-CLEAN-27] 停下之后才清理；一天后仍在使用则再顺延一天", () => {
    const snoozed = { ...ready, snoozedUntil: NOW + DAY_MS };
    const later = NOW + DAY_MS;
    expect(judge([snoozed], { now: later }).clean).toEqual(["p1"]);
    const again = judge([snoozed], { now: later, inUse: new Set(["p1"]) });
    expect(again.postponed).toEqual([{ id: "p1", until: later + DAY_MS }]);
  });

  it("[LIBRARY-AUTO-CLEAN-29] 根目录不在：整轮跳过，没有提醒也没有清理", () => {
    const verdict = judge([ready, candidate({ id: "p2", lastUsedAt: NOW - 29 * DAY_MS - H })], {
      rootPresent: false,
    });
    expect(verdict).toEqual({ remind: [], clean: [], postponed: [], skipped: "root-missing" });
  });

  it("[LIBRARY-AUTO-CLEAN-30] 根目录回来之后按正常规则判断，状态没有丢", () => {
    const skipped = judge([ready], { rootPresent: false });
    expect(skipped.clean).toEqual([]);
    expect(judge([ready]).clean).toEqual(["p1"]);
  });

  it("[LIBRARY-AUTO-CLEAN-34] 同样的输入多次调用结果相同，不改输入", () => {
    const input = [ready, candidate({ id: "p2", lastUsedAt: NOW - 29 * DAY_MS - H })];
    const frozen = structuredClone(input);
    const first = judge(input, { inUse: new Set(["p2"]) });
    expect(judge(input, { inUse: new Set(["p2"]) })).toEqual(first);
    expect(input).toEqual(frozen);
  });

  it("[LIBRARY-AUTO-CLEAN-36] 重建后上次使用是当前时间：两份清单都是空的", () => {
    const rebuilt = candidate({ autoClean: { enabled: true, days: 7 }, lastUsedAt: NOW });
    const verdict = judge([rebuilt]);
    expect(verdict.remind).toEqual([]);
    expect(verdict.clean).toEqual([]);
  });
});
