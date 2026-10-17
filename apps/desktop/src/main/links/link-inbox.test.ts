import { describe, expect, it } from "vitest";
import { LinkInbox } from "./link-inbox.ts";

describe("链接收件箱", () => {
  it("处理程序就绪之前来的链接排队，就绪后按到达顺序交出，之后的直接交", () => {
    const inbox = new LinkInbox();
    const seen: string[] = [];
    inbox.push("runyard://open/a");
    inbox.push("runyard://open/b");
    expect(seen).toEqual([]);
    inbox.attach((address) => seen.push(address));
    expect(seen).toEqual(["runyard://open/a", "runyard://open/b"]);
    inbox.push("runyard://open/c");
    expect(seen).toEqual(["runyard://open/a", "runyard://open/b", "runyard://open/c"]);
  });

  it("就绪之前最多排 20 条，多的丢掉", () => {
    const inbox = new LinkInbox();
    for (let i = 0; i < 50; i += 1) inbox.push(`runyard://open/p${i}`);
    const seen: string[] = [];
    inbox.attach((address) => seen.push(address));
    expect(seen).toHaveLength(20);
  });
});
