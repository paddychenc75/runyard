import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingReplies } from "./pending-replies.ts";

afterEach(() => vi.useRealTimers());

describe("等 pty-host 按编号回话", () => {
  it("回话按编号对上；编号各不相同", async () => {
    const replies = new PendingReplies<string | null>(null);
    const ids: number[] = [];
    const a = replies.ask(1000, (id) => ids.push(id));
    const b = replies.ask(1000, (id) => ids.push(id));
    expect(new Set(ids).size).toBe(2);
    replies.reply(ids[1] as number, "second");
    replies.reply(ids[0] as number, "first");
    expect(await a).toBe("first");
    expect(await b).toBe("second");
  });

  it("到时限没回话：用后备值，迟到的回话被忽略", async () => {
    vi.useFakeTimers();
    const replies = new PendingReplies<boolean>(false);
    let id = 0;
    const waiting = replies.ask(500, (assigned) => {
      id = assigned;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(await waiting).toBe(false);
    replies.reply(id, true); // 不报错、不改变
  });

  it("pty-host 没了：还在等的全部立刻用后备值", async () => {
    const replies = new PendingReplies<boolean>(false);
    const waiting = [replies.ask(10_000, () => {}), replies.ask(10_000, () => {})];
    replies.settleAll();
    expect(await Promise.all(waiting)).toEqual([false, false]);
  });
});
